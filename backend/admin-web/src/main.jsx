import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  inMemoryPersistence,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from "firebase/auth";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./admin.css";

const REFRESH_MS = 15_000;

function normalizeBase(value) {
  const parsed = new URL(value);
  return parsed.origin + parsed.pathname.replace(/\/+$/, "");
}

async function requestOverview(base, user) {
  const idToken = await user.getIdToken();
  const response = await fetch(`${base}/api/admin/overview`, {
    headers: { Authorization: `Bearer ${idToken}` },
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || `Request failed (${response.status})`);
  }
  return data;
}

async function getFirebaseConfig(base) {
  const response = await fetch(`${base}/api/auth/config`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || "Firebase Authentication is not configured.");
  }
  return data.firebase;
}

async function createFirebaseAuth(base) {
  const config = await getFirebaseConfig(base);
  const appName = `within-limits-admin-${config.projectId}`;
  const app = getApps().find((candidate) => candidate.name === appName)
    || initializeApp(config, appName);
  const auth = getAuth(app);
  await setPersistence(auth, inMemoryPersistence);
  return auth;
}

function distanceMeters(first, second) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const deltaLatitude = radians(second.latitude - first.latitude);
  const deltaLongitude = radians(second.longitude - first.longitude);
  const a = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude))
    * Math.sin(deltaLongitude / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "—";
  if (meters < 1_000) return `${Math.round(meters)} m`;
  return `${(meters / 1_000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

function formatLastSeen(value) {
  if (!value) return "Not reported";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not reported";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function coordinates(device) {
  const values = device?.location?.coordinates;
  if (!Array.isArray(values) || values.length < 2) return null;
  const [longitude, latitude] = values.map(Number);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function MapPanel({ devices, radius, onRadiusChange }) {
  const mapElement = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const [hasPoints, setHasPoints] = useState(false);

  useEffect(() => {
    if (!mapElement.current || mapRef.current) return undefined;
    const map = L.map(mapElement.current, { zoomControl: true, attributionControl: false }).setView([20, 0], 2);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    }).addTo(map);
    L.control.attribution({ prefix: false, position: "bottomright" }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    const resize = window.setTimeout(() => map.invalidateSize(), 80);
    return () => {
      window.clearTimeout(resize);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layers = layerRef.current;
    if (!map || !layers) return;
    layers.clearLayers();
    const visible = devices.map((device) => ({ device, point: coordinates(device) })).filter(({ point }) => point);
    setHasPoints(visible.length > 0);
    if (!visible.length) {
      map.setView([20, 0], 2);
      return;
    }

    const points = [];
    visible.forEach(({ device, point }) => {
      const isLeader = device.role === "Group leader";
      const icon = L.divIcon({
        className: "admin-marker-wrap",
        html: `<span class="admin-marker ${isLeader ? "host" : "member"}"></span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      L.marker([point.latitude, point.longitude], { icon })
        .bindPopup(`<strong>${escapeHtml(device.deviceName || device.deviceId)}</strong><br>${escapeHtml(device.role)} · ${escapeHtml(device.status || "unknown")}`)
        .addTo(layers);
      points.push([point.latitude, point.longitude]);
    });
    const leader = devices.find((device) => device.role === "Group leader");
    const leaderPoint = coordinates(leader);
    if (leaderPoint) {
      L.circle([leaderPoint.latitude, leaderPoint.longitude], {
        radius: Number(radius), color: "#3d8064", weight: 1, fillColor: "#6eaa87", fillOpacity: 0.09,
      }).addTo(layers);
    }
    if (points.length === 1) map.setView(points[0], 15);
    else map.fitBounds(L.latLngBounds(points).pad(0.2), { maxZoom: 16 });
  }, [devices, radius]);

  return (
    <article className="panel map-panel">
      <div className="panel-heading map-heading">
        <div><p className="eyebrow">CHECKPOINT MAP</p><h2>{hasPoints ? "Reported device positions" : "Waiting for checkpoint data"}</h2></div>
        <label className="radius-control"><span>Monitoring radius <strong>{Number(radius).toLocaleString()} m</strong></span><input type="range" min="100" max="5000" step="100" value={radius} onChange={(event) => onRadiusChange(Number(event.target.value))} /></label>
      </div>
      <div className="map-canvas">
        <div ref={mapElement} id="map" aria-label="Map showing checkpoint locations" />
        {!hasPoints && <div className="map-empty">Checkpoint positions appear here after ESP32 devices report.<small>Mobile phone GPS is excluded.</small></div>}
      </div>
      <div className="map-legend"><span><i className="legend-dot host-dot" />Checkpoint / group leader</span><span><i className="legend-dot member-dot" />Linked IoT device</span><span className="muted">No mobile GPS coordinates are shown.</span></div>
    </article>
  );
}

function HardwarePanel() {
  return (
    <section className="hardware-panel panel" aria-labelledby="hardwareTitle">
      <div className="panel-heading hardware-panel-heading">
        <div><p className="eyebrow">IOT ROLLOUT</p><h2 id="hardwareTitle">Hardware telemetry</h2></div>
        <span className="integration-state"><i />Integration pending</span>
      </div>
      <div className="hardware-grid">
        <article className="hardware-item"><span className="hardware-glyph">ESP</span><div><strong>Checkpoint controllers</strong><small>ESP32 enrollment and heartbeat</small></div><span className="hardware-state">Not reporting</span></article>
        <article className="hardware-item"><span className="hardware-glyph ble">BLE</span><div><strong>Active tags</strong><small>BLE scan events and signal strength</small></div><span className="hardware-state">Not reporting</span></article>
        <article className="hardware-item"><span className="hardware-glyph rfid">RF</span><div><strong>RFID checkpoints</strong><small>Passive tag reads and checkpoint time</small></div><span className="hardware-state">Not reporting</span></article>
      </div>
      <p className="hardware-footnote">These are integration states, not live readings. Firmware reporting will add enrolled devices, heartbeat times, checkpoint detections, and tag events.</p>
    </section>
  );
}

function App() {
  const [apiBase, setApiBase] = useState(window.location.origin);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firebaseAuth, setFirebaseAuth] = useState(null);
  const [adminUser, setAdminUser] = useState(null);
  const [accessMessage, setAccessMessage] = useState("");
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [accessError, setAccessError] = useState("");
  const [notice, setNotice] = useState("Phone GPS is not shown here. This page shows group membership and connection status; ESP32 checkpoint and tag reports will appear after hardware enrollment and firmware reporting are connected.");
  const [noticeIsError, setNoticeIsError] = useState(false);
  const [connectionState, setConnectionState] = useState({ label: "Connecting", state: "" });
  const [groups, setGroups] = useState([]);
  const [summary, setSummary] = useState({});
  const [selectedHostId, setSelectedHostId] = useState("");
  const [lastUpdated, setLastUpdated] = useState("—");
  const [radius, setRadius] = useState(5000);
  const [working, setWorking] = useState(false);
  const busyRef = useRef(false);

  const selectedGroup = useMemo(
    () => groups.find((group) => group.host?.deviceId === selectedHostId) || null,
    [groups, selectedHostId],
  );
  const selectedDevices = useMemo(() => selectedGroup ? [
    { ...selectedGroup.host, role: "Group leader" },
    ...(selectedGroup.members || []).map((member) => ({ ...member, role: "Linked device" })),
  ] : [], [selectedGroup]);
  const leaderLocation = useMemo(() => coordinates(selectedGroup?.host), [selectedGroup]);

  const refresh = useCallback(async (quiet = false) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    if (!quiet) setWorking(true);
    try {
      const data = await requestOverview(apiBase, adminUser);
      const nextGroups = data.groups || [];
      setGroups(nextGroups);
      setSummary(data.summary || {});
      setSelectedHostId((current) => nextGroups.some((group) => group.host?.deviceId === current)
        ? current
        : (nextGroups[0]?.host?.deviceId || ""));
      setLastUpdated(new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date(data.generatedAt || Date.now())));
      setConnectionState({ label: "Connected", state: "online" });
      setNotice("Phone GPS is not shown here. This page shows group membership and connection status; ESP32 checkpoint and tag reports will appear after hardware enrollment and firmware reporting are connected.");
      setNoticeIsError(false);
      return true;
    } catch (error) {
      setConnectionState({ label: "Connection issue", state: "error" });
      if (quiet) {
        setNotice(error.message);
        setNoticeIsError(true);
      } else {
        throw error;
      }
      return false;
    } finally {
      busyRef.current = false;
      setWorking(false);
    }
  }, [adminUser, apiBase]);

  useEffect(() => {
    if (!dashboardOpen) return undefined;
    const timer = window.setInterval(() => void refresh(true), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [dashboardOpen, refresh]);

  async function handleLogin(event) {
    event.preventDefault();
    setAccessError("");
    let auth;
    try {
      const base = normalizeBase(window.location.origin);
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail || !password) throw new Error("Enter your email address and password.");
      setWorking(true);
      auth = await createFirebaseAuth(base);
      const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      const data = await requestOverview(base, credential.user);
      setFirebaseAuth(auth);
      setAdminUser(credential.user);
      setApiBase(base);
      setGroups(data.groups || []);
      setSummary(data.summary || {});
      setSelectedHostId(data.groups?.[0]?.host?.deviceId || "");
      setLastUpdated(new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date(data.generatedAt || Date.now())));
      setConnectionState({ label: "Connected", state: "online" });
      setPassword("");
      setAccessMessage("");
      setNotice("Phone GPS is not shown here. This page shows group membership and connection status; ESP32 checkpoint and tag reports will appear after hardware enrollment and firmware reporting are connected.");
      setNoticeIsError(false);
      setDashboardOpen(true);
    } catch (error) {
      setAccessError(error.message);
      if (auth) await firebaseSignOut(auth).catch(() => {});
      setFirebaseAuth(null);
      setAdminUser(null);
    } finally {
      setWorking(false);
    }
  }

  async function handlePasswordReset() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setAccessError("Enter your email address first, then choose reset password.");
      return;
    }
    setWorking(true);
    setAccessError("");
    try {
      const auth = await createFirebaseAuth(normalizeBase(window.location.origin));
      await sendPasswordResetEmail(auth, normalizedEmail);
      setAccessMessage("If that admin account exists, Firebase has sent a password reset email.");
    } catch (error) {
      if (error.code === "auth/user-not-found" || error.code === "auth/invalid-credential") {
        setAccessMessage("If that admin account exists, Firebase has sent a password reset email.");
      } else {
        setAccessError(error.message);
      }
    } finally {
      setWorking(false);
    }
  }

  async function ringDevice(targetDeviceId) {
    if (!selectedGroup || !targetDeviceId) return;
    try {
      const idToken = await adminUser.getIdToken();
      const response = await fetch(`${apiBase}/api/admin/groups/${encodeURIComponent(selectedGroup.host.deviceId)}/ring`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ targetDeviceId }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Could not send the buzzer.");
      window.alert(data.message || "Buzzer sent.");
    } catch (error) {
      window.alert(error.message || "Could not send the buzzer.");
    }
  }

  function signOut() {
    if (firebaseAuth) void firebaseSignOut(firebaseAuth);
    setFirebaseAuth(null);
    setAdminUser(null);
    setDashboardOpen(false);
    setPassword("");
    setGroups([]);
    setSummary({});
    setSelectedHostId("");
    setConnectionState({ label: "Disconnected", state: "" });
    setAccessError("");
    setAccessMessage("");
  }

  if (!dashboardOpen) {
    return (
      <main className="access-shell">
        <section className="access-card">
          <div className="brand-mark" aria-hidden="true">W</div>
          <p className="eyebrow">WITHIN LIMITS · ADMIN</p>
          <h1>Group monitor</h1>
          <p className="muted">Sign in with the email account assigned an admin role.</p>
          <form onSubmit={handleLogin}>
            <label htmlFor="adminEmail">Email</label>
            <input id="adminEmail" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
            <label htmlFor="adminPassword">Password</label>
            <input id="adminPassword" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
            <button className="primary-button" type="submit" disabled={working}>{working ? "Signing in…" : "Sign in"}</button>
            <button className="text-button" type="button" onClick={() => void handlePasswordReset()} disabled={working}>Reset password</button>
            <p className="error-message" role="alert">{accessError}</p>
            <p className="success-message" role="status">{accessMessage}</p>
          </form>
          <p className="access-footnote">Admin accounts are created by the project owner. Sign-up is disabled on this page.</p>
        </section>
      </main>
    );
  }

  return (
    <div className="dashboard">
      <header className="topbar">
        <a className="brand" href="/admin/" aria-label="Within Limits admin home">
          <span className="brand-mark small" aria-hidden="true">W</span>
          <span><strong>Within Limits</strong><small>Group monitor</small></span>
        </a>
        <div className="topbar-actions">
          <span className={`connection-state ${connectionState.state}`}><i />{connectionState.label}</span>
          <button className="quiet-button" type="button" onClick={() => void refresh()} disabled={working}>{working ? "Refreshing…" : "Refresh"}</button>
          <button className="quiet-button" type="button" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <main className="content">
        <section className="page-heading">
          <div><p className="eyebrow">OPERATIONS</p><h1>Group overview</h1><p className="muted">Connection status for monitored groups. Mobile GPS is excluded.</p></div>
          <div className="update-copy">Last refreshed <strong>{lastUpdated}</strong></div>
        </section>

        <div className={`notice ${noticeIsError ? "notice-error" : ""}`} role="status">{notice}</div>
        <HardwarePanel />

        <section className="summary-grid" aria-label="Group summary">
          <article className="summary-card"><span>Groups</span><strong>{summary.groups ?? groups.length}</strong><small>with accepted connections</small></article>
          <article className="summary-card"><span>Devices</span><strong>{summary.devices ?? "—"}</strong><small>in monitored groups</small></article>
          <article className="summary-card"><span>Online</span><strong>{summary.online ?? "—"}</strong><small>currently connected</small></article>
          <article className="summary-card"><span>Hardware reports</span><strong>{summary.hardwareReports ?? "—"}</strong><small>available after IoT feed setup</small></article>
        </section>

        <section className="monitor-grid">
          <MapPanel devices={selectedDevices} radius={radius} onRadiusChange={setRadius} />
          <aside className="panel groups-panel">
            <div className="panel-heading"><div><p className="eyebrow">TRACKING GROUPS</p><h2>Groups</h2></div><span className="count-pill">{groups.length}</span></div>
            <div className="group-list">
              {groups.length === 0 ? <div className="empty-state">No accepted host and linked-device groups yet.</div> : groups.map((group) => {
                const host = group.host || {};
                const online = [host, ...(group.members || [])].filter((device) => device.status === "online").length;
                const active = host.deviceId === selectedHostId;
                return <button className={`group-item ${active ? "active" : ""}`} type="button" key={host.deviceId} onClick={() => setSelectedHostId(host.deviceId)}>
                  <span className="group-copy"><span className="group-name">{host.deviceName || host.deviceId || "Unnamed group"}</span><span className="group-meta">{(group.members || []).length + 1} devices · {online} online</span></span>
                  <span className="group-state">{online ? "ACTIVE" : "OFFLINE"}</span>
                </button>;
              })}
            </div>
          </aside>
        </section>

        <section className="panel devices-panel">
          <div className="panel-heading"><div><p className="eyebrow">SELECTED GROUP</p><h2>Devices</h2></div><span className="count-pill">{selectedDevices.length} devices</span></div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Device</th><th>Role</th><th>Type</th><th>Status</th><th>Distance from leader</th><th>Last seen</th><th>Action</th></tr></thead>
              <tbody>{selectedDevices.length === 0 ? <tr><td colSpan="7" className="empty-state">Group connections will appear here when devices are linked.</td></tr> : selectedDevices.map((device) => {
                const point = coordinates(device);
                const distance = leaderLocation && point ? distanceMeters(leaderLocation, point) : null;
                const radiusClass = device.role === "Group leader" ? "within" : distance === null ? "unknown" : distance <= radius ? "within" : "outside";
                const radiusLabel = device.role === "Group leader" ? "Group center" : distance === null ? "Location unavailable" : `${formatDistance(distance)} · ${distance <= radius ? "Within radius" : "Outside radius"}`;
                return <tr key={device.deviceId}>
                  <td><div className="device-name">{device.deviceName || "Unnamed device"}</div><div className="device-id">{device.deviceId}</div></td>
                  <td><span className={`role-pill ${device.role === "Group leader" ? "host" : ""}`}>{device.role}</span></td>
                  <td>{device.deviceType || "unknown"}</td>
                  <td><span className={`status-pill ${device.status === "online" ? "online" : "offline"}`}>{device.status || "unknown"}</span></td>
                  <td><span className={`radius-pill ${radiusClass}`}>{radiusLabel}</span></td>
                  <td>{formatLastSeen(device.lastSeen)}</td>
                  <td>{device.status === "online" ? <button className="ring-button" type="button" onClick={() => void ringDevice(device.deviceId)}>Ring</button> : <span className="muted">—</span>}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        </section>
        <footer>Phone GPS is private to the app’s sharing group. Checkpoint tracking will use IoT device reports.</footer>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
