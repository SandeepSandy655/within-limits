import { useEffect, useMemo, useRef, useState } from "react";
import CheckpointMap from "./CheckpointMap";
import ArrivalFeed from "./ArrivalFeed";
import DashboardHome from "./DashboardHome";
import Sidebar from "./Sidebar";
import GroupHistory from "./GroupHistory";
import "./dashboard-shell.css";
import ProximityAlerts from "./ProximityAlerts";
import GroupDetails from "./GroupDetails";
import { groupAlerts } from "./proximitySummary.js";
import Brand from "./Brand";
import { GroupEditor, RouteEditor } from "./Editors";
import { backendUrl } from "./backendUrl.js";
import CardAssignments from "./CardAssignments";

export async function adminRequest(user, path = "/overview", options = {}) {
  const token = await user.getIdToken();
  const response = await fetch(backendUrl(`/api/admin${path}`), { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.message || "Could not complete the request.");
  return data;
}
function time(value) { return value ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date(value)) : "Awaiting first visit"; }
function dateTime(value) { return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Awaiting first visit"; }
function Icon({ name }) {
  const paths = { pin: <><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>, groups: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5"/></>, clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>, route: <><circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h9a4 4 0 0 1 0 8H8a3 3 0 0 0 0 6h9"/></> };
  paths.refresh = <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.5-1L20 9M4 15l2.4 3A7 7 0 0 0 17.9 17"/></>;
  paths.expand = <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>;
  paths.plus = <path d="M12 5v14M5 12h14"/>;
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.groups}</svg>;
}

const views = [
  { id: "dashboard", label: "Dashboard", title: "Dashboard" },
  { id: "routes", label: "Routes & checkpoints", title: "Routes & checkpoints" },
  { id: "tracked-groups", label: "Groups", title: "Active groups" },
  { id: "history", label: "History", title: "Route history" },
];
function currentView() {
  const hash = window.location.hash.slice(1);
  const id = hash === "overview" ? "dashboard" : hash === "completed-trips" ? "history" : hash;
  return views.find(view => view.id === id)?.id || "dashboard";
}

export default function Dashboard({ user, initialData, onSignOut }) {
  const [data, setData] = useState(initialData);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [routeId, setRouteId] = useState(initialData.routes[0]?.id || "");
  const [groupId, setGroupId] = useState("");
  const [selectedCheckpoint, setSelectedCheckpoint] = useState("");
  const [query, setQuery] = useState("");
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [working, setWorking] = useState(false);
  const [editor, setEditor] = useState(null);
  const [fit, setFit] = useState(0);
  const [activeSection, setActiveSection] = useState(currentView);
  const inFlight = useRef(null);
  const alive = useRef(true);
  const route = data.routes.find((item) => item.id === routeId) || data.routes[0];
  const groups = useMemo(() => data.groups.filter((group) => group.routeId === route?.id), [data.groups, route?.id]);
  const selectedGroup = groups.find((group) => group.id === groupId);
  const alerts = groupAlerts(data.groups, data.proximityMonitors || []);
  const regions = [...new Set(data.routes.map((item) => item.region))];
  const visibleGroups = groups.filter((group) => `${group.name} ${group.leaderName}`.toLowerCase().includes(query.toLowerCase()) && (!onlyAttention || group.status === "attention"));
  async function refresh() {
    if (inFlight.current) return inFlight.current;
    setWorking(true);
    const request = (async () => {
      try { const next = await adminRequest(user); if (alive.current) { setData(next); setError(""); } }
      catch (failure) { if (alive.current) setError(`Updates paused. ${failure.message}`); }
      finally { if (alive.current) setWorking(false); inFlight.current = null; }
    })();
    inFlight.current = request;
    return request;
  }
  useEffect(() => {
    alive.current = true;
    const timer = setInterval(() => void refresh(), 15_000);
    return () => { alive.current = false; clearInterval(timer); };
  }, [user]);
  useEffect(() => {
    const onHashChange = () => setActiveSection(currentView());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  function chooseView(id, selectedId = "") {
    setDrawerOpen(false);
    if (id === "tracked-groups") setGroupId(selectedId);
    setActiveSection(id);
    if (window.location.hash !== `#${id}`) window.history.pushState(null, "", `#${id}`);
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }
  function chooseRoute(id) { setRouteId(id); setGroupId(""); setSelectedCheckpoint(""); setQuery(""); setOnlyAttention(false); }
  function openGroup(group) {
    chooseRoute(group.routeId);
    chooseView("tracked-groups", group.id);
  }
  async function save(path, body, method) {
    const result = await adminRequest(user, path, { method, body: JSON.stringify(body) });
    setEditor(null);
    setNotice(path === "/groups" ? "Group added. Checkpoint visits will appear as they arrive." : "Route saved. Your checkpoints are ready.");
    if (path !== "/groups") { setRouteId(result.id); chooseView("routes"); } else setGroupId(result.id);
    if (inFlight.current) await inFlight.current;
    await refresh();
  }
  async function assignBoard(monitorId, memberId) {
    await adminRequest(user, `/proximity/${encodeURIComponent(monitorId)}/assignment`, { method: "PUT", body: JSON.stringify({ memberId }) });
    if (inFlight.current) await inFlight.current;
    await refresh();
  }
  async function renameCard(memberId, name) {
    await adminRequest(user, `/members/${encodeURIComponent(memberId)}`, { method: 'PATCH', body: JSON.stringify({ name }) });
    if (inFlight.current) await inFlight.current;
    await refresh();
  }
  const activeMembers = groups.flatMap((group) => group.members);
  const completedTrips = data.completedTrips || [];
  return <div className="dashboard">
    <a className="skip-link" href="#workspace">Skip to workspace</a>
    <header className="topbar admin-topbar"><button className="menu-button" aria-label="Open dashboard menu" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
      <a className="brand-link" href="#dashboard" onClick={(event) => { event.preventDefault(); chooseView("dashboard"); }}><Brand/></a>
      <span className="topbar-section">Admin workspace</span>
      <div className="topbar-actions"><span className={`connection-state ${error ? "error" : "online"}`}><i />{error ? "Updates paused" : "Connected"}</span><button className="quiet-button" onClick={onSignOut}>Sign out</button></div>
    </header>
    <main className="content" id="workspace">
      <section className="page-heading"><div><h1>{views.find((view) => view.id === activeSection).title}</h1></div><div className="heading-actions"><span className="update-copy">Last updated {time(data.generatedAt)}</span><button className="quiet-button refresh-button" aria-label={working ? "Syncing monitoring data" : "Sync monitoring data"} onClick={() => void refresh()} disabled={working}><Icon name="refresh"/><span>{working ? "Syncing…" : "Sync data"}</span></button></div></section>
      {error && <div className="notice notice-error" role="alert">{error} Showing the last available update.</div>}
      <ProximityAlerts alerts={alerts} onOpenGroup={openGroup}/>
      {notice && <div className="notice" role="status">{notice}<button aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button></div>}
      {activeSection === "dashboard" && <DashboardHome data={data} onRoutes={id => { if (id) chooseRoute(id); chooseView("routes"); }} onGroups={() => chooseView("tracked-groups")} onHistory={() => chooseView("history")} onNewRoute={() => setEditor("new-route")} onOpenGroup={openGroup}/>}
      {["routes", "tracked-groups"].includes(activeSection) && <section className="route-bar" aria-label="Region and route selection"><span className="route-bar-icon"><Icon name="pin" /></span><label>Region<select value={route?.region || ""} disabled={!regions.length} onChange={(e) => chooseRoute(data.routes.find((item) => item.region === e.target.value).id)}>{!regions.length && <option value="">Choose your region</option>}{regions.map((region) => <option key={region}>{region}</option>)}</select></label><span className="route-divider"/><label>Active route<select value={route?.id || ""} disabled={!route} onChange={(e) => chooseRoute(e.target.value)}>{!route && <option value="">No route set up</option>}{data.routes.filter((item) => item.region === route?.region).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><div className="route-bar-actions">{route && <button className="quiet-button" onClick={() => setEditor("edit-route")}>Edit route</button>}<button className="primary-button" onClick={() => setEditor("new-route")}><Icon name="plus"/>{route ? "New route" : "Set up route"}</button></div></section>}
      <section className="summary-grid" hidden={activeSection !== "routes"} aria-label="Route summary">{[
        ["Checkpoints", route?.checkpoints.length || 0, "along this route", "pin"], ["Active people", activeMembers.length, "currently assigned cards", "groups"], ["Exited", route?.exitedCount || 0, "completed trips", "route"], ["Needs update", groups.filter((group) => group.status === "attention").length, "groups with missing or older visits", "clock"],
      ].map(([label, value, subtitle, icon], index) => <article className={`summary-card${index === 3 && value > 0 ? " needs-attention" : ""}`} key={label}><div><span>{label}</span><span className="stat-icon"><Icon name={icon}/></span></div><strong>{value}</strong><small>{subtitle}</small></article>)}</section>
      {activeSection === "routes" && <section className="monitor-grid" id="overview" aria-label="Route monitoring" hidden={activeSection !== "routes"}><article className="panel map-panel"><div className="panel-heading"><div><h2>{route?.name || "Route map"}</h2><p className="section-description">{route ? `${route.region} · ${route.checkpoints.length} checkpoints${route.mapMode === "schematic" ? " · Placement layout, not GPS" : ""}` : "Set up a route to start monitoring"}</p></div><button className="quiet-button" onClick={() => setFit(fit + 1)} disabled={!route}><Icon name="expand"/>Fit route</button></div><div className="map-canvas"><CheckpointMap route={route} group={selectedGroup} selectedCheckpoint={selectedCheckpoint} onSelect={setSelectedCheckpoint} fitKey={fit}/>{!route && <div className="map-empty"><span className="empty-icon"><Icon name="route"/></span><h3>No route configured</h3><p>Add checkpoints and connect them to define the route you want to monitor.</p><button className="primary-button" onClick={() => setEditor("new-route")}>Set up route</button></div>}{route && <div className="map-caption"><i/>{selectedGroup ? `${selectedGroup.name} · latest checkpoint visits` : `${route.checkpoints.length} checkpoints on this route`}</div>}</div><div className="map-legend"><span><i className="legend-dot checkpoint"/>Checkpoint</span><span><i className="legend-line"/>Planned path</span>{selectedGroup && <span><i className="legend-dot sighting"/>Latest group sighting</span>}</div></article>
        <aside className="panel checkpoints-panel"><div className="panel-heading"><h2>Checkpoints</h2><span className="count-pill">{route?.checkpoints.length || 0}</span></div><p className="section-description">{selectedGroup ? `Visit progress · ${selectedGroup.name}` : "Listed in route order"}</p><div className="checkpoint-list">{!route ? <div className="empty-state"><Icon name="pin"/><h3>No checkpoints yet</h3><p>Add checkpoints when you set up a route.</p></div> : route.checkpoints.map((cp, index) => { const visit = selectedGroup?.visits.find((item) => item.checkpointId === cp.id); const complete = selectedGroup && visit?.seen === selectedGroup.members.length; return <button className={`checkpoint-row ${selectedCheckpoint === cp.id ? "selected" : ""}`} aria-pressed={selectedCheckpoint === cp.id} key={cp.id} onClick={() => setSelectedCheckpoint(cp.id)}><span className={`step-number ${complete ? "complete" : ""}`}>{complete ? "✓" : index + 1}</span><span><strong>{cp.name}</strong><small>{selectedGroup ? `${visit?.seen || 0} of ${selectedGroup.members.length} members visited` : index === 0 ? "Starting point" : index === route.checkpoints.length - 1 ? "Final checkpoint" : "Along the route"}</small></span><span className="row-arrow" aria-hidden="true">›</span></button>; })}</div><div className="checkpoints-footnote"><Icon name="pin"/><span>{route ? "Select a checkpoint to locate it on the map." : "Checkpoints appear on the route map."}</span></div></aside>
        <ArrivalFeed route={route} groups={groups} completedTrips={completedTrips} formatTime={dateTime} onChoose={(arrival) => { setSelectedCheckpoint(arrival.checkpointId); chooseView(groups.some(group => group.id === arrival.groupId) ? "tracked-groups" : "history", arrival.groupId); }}/>
      </section>}
      <section className="groups-section" id="tracked-groups" hidden={activeSection !== "tracked-groups"}><div className="section-heading"><div><h2>Active groups on this route <span className="count-pill">{groups.length}</span></h2><p className="section-description">Select a group to view who is nearby and who needs a check</p></div><div className="group-actions"><button className="quiet-button" disabled={!route} onClick={() => setEditor("group")}><Icon name="plus"/>Add group</button></div></div>
        <div className="group-grid is-directory"><aside className="panel groups-panel"><div className="group-search"><label className="sr-only" htmlFor="group-search">Find a group or leader</label><input id="group-search" placeholder="Search groups or leaders…" value={query} onChange={(e) => setQuery(e.target.value)}/><div className="segmented"><button aria-pressed={!onlyAttention} onClick={() => setOnlyAttention(false)}>All groups</button><button aria-pressed={onlyAttention} onClick={() => setOnlyAttention(true)}>Needs update</button></div></div><div className="group-list">{!visibleGroups.length ? <div className="empty-state"><Icon name="groups"/><h3>{groups.length ? "No matching groups" : route?.autoEnroll ? "No active trips" : "No groups assigned"}</h3><p>{groups.length ? "Try a different name or filter." : route?.autoEnroll ? "Scan a card at the first checkpoint to register automatically." : "Add a group to start following its checkpoint visits."}</p></div> : visibleGroups.map((group) => <button className={`group-item ${selectedGroup?.id === group.id ? "active" : ""}`} aria-expanded={selectedGroup?.id === group.id} aria-controls={selectedGroup?.id === group.id ? "group-details" : undefined} key={group.id} onClick={() => setGroupId(group.id)}><span className="group-avatar">{group.name.slice(0, 1).toUpperCase()}</span><span className="group-copy"><strong>{group.name}</strong><small>{group.members.length} active · {group.finishedMembers || 0} finished · {group.leaderName}</small><span className="group-open-hint">View proximity and checkpoints</span></span><span className="row-arrow" aria-hidden="true">→</span></button>)}</div></aside>
          {selectedGroup && activeSection === "tracked-groups" && <GroupDetails group={selectedGroup} route={route} monitors={data.proximityMonitors || []} formatTime={dateTime} onAssign={assignBoard} onAddGroup={() => setEditor("group")} onClose={() => setGroupId("")}/>}
        </div>
      </section>
      {activeSection === "tracked-groups" && route && <CardAssignments route={route} groups={groups} onRename={renameCard}/>}
      {activeSection === "history" && <GroupHistory routes={data.routes} request={path => adminRequest(user, path)} revision={data.generatedAt} formatTime={dateTime}/>}
      <footer><span>Within Limits · Admin</span><span>Refreshes every 15 seconds</span></footer>
    </main>
    {drawerOpen && <Sidebar views={views} active={activeSection} user={user} onChoose={chooseView} onClose={() => setDrawerOpen(false)} onSignOut={onSignOut}/>}
    {(editor === "new-route" || editor === "edit-route") && <RouteEditor route={editor === "edit-route" ? route : null} onClose={() => setEditor(null)} onSave={(draft) => save(editor === "edit-route" ? `/routes/${route.id}` : "/routes", draft, editor === "edit-route" ? "PUT" : "POST")}/>}
    {editor === "group" && route && <GroupEditor route={route} onClose={() => setEditor(null)} onSave={(draft) => save("/groups", draft, "POST")}/>}
  </div>;
}
