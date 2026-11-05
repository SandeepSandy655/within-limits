import { useEffect, useRef, useState } from "react";
import CheckpointMap from "./CheckpointMap";

function Modal({ title, children, onClose, busy, wide = false }) {
  const dialog = useRef(null);
  useEffect(() => { dialog.current.showModal(); }, []);
  return <dialog ref={dialog} className={`editor-dialog ${wide ? "wide" : ""}`} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} aria-labelledby="editor-title">
    <div className="dialog-heading"><div><p className="eyebrow">WORKSPACE SETUP</p><h2 id="editor-title">{title}</h2></div><button className="icon-button" aria-label="Close editor" onClick={onClose} disabled={busy}>×</button></div>
    {children}
  </dialog>;
}

export function RouteEditor({ route, onClose, onSave }) {
  const [draft, setDraft] = useState(() => route ? structuredClone(route) : { name: "", region: "", path: [], checkpoints: [], autoEnroll: true, mapMode: "geographic" });
  const [mode, setMode] = useState("checkpoints");
  const [customPath, setCustomPath] = useState(Boolean(route));
  const [selected, setSelected] = useState("");
  const [manual, setManual] = useState({ latitude: "", longitude: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fit, setFit] = useState(0);
  function updateCheckpoints(update) {
    setDraft((current) => {
      const checkpoints = update(current.checkpoints);
      return { ...current, checkpoints, path: customPath ? current.path : checkpoints.map((cp) => [cp.latitude, cp.longitude]) };
    });
  }
  function addCheckpoint([latitude, longitude]) {
    if (draft.checkpoints.length >= 100) { setError("A route can contain up to 100 checkpoints."); return; }
    // UUID generation also works on a local network origin without a secure context.
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    updateCheckpoints((points) => [...points, { id, name: `Checkpoint ${points.length + 1}`, latitude, longitude }]);
    setSelected(id);
  }
  function place(point) {
    if (busy) return;
    if (mode === "checkpoints") addCheckpoint(point);
    else {
      setDraft((current) => ({ ...current, path: [...(customPath ? current.path : []), point] }));
      setCustomPath(true);
    }
  }
  function reorder(index, delta) {
    updateCheckpoints((points) => { const next = [...points]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next; });
  }
  async function submit(event) {
    event.preventDefault(); setError("");
    if (draft.checkpoints.length < 2 || draft.path.length < 2) { setError("Place at least two checkpoints and draw a path before saving."); return; }
    setBusy(true);
    try { await onSave(draft); } catch (failure) { setError(failure.message); setBusy(false); }
  }
  return <Modal title={route ? "Edit route & checkpoints" : "Set up your route"} onClose={onClose} busy={busy} wide>
    <form onSubmit={submit}>
      <fieldset disabled={busy} className="editor-fields">
        <div className="route-names"><label>Region<input autoFocus required maxLength={100} placeholder="e.g. Campus north" value={draft.region} onChange={(e) => setDraft({ ...draft, region: e.target.value })} /></label><label>Route name<input required maxLength={100} placeholder="e.g. Main trail" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label></div>
        <label className="auto-enroll-option"><input type="checkbox" checked={Boolean(draft.autoEnroll)} onChange={(event) => setDraft({ ...draft, autoEnroll: event.target.checked })}/><span>Register new cards at the first checkpoint<small>Name them Person 1, Person 2, and so on. Release each card after all checkpoints are visited in order, ending at the last checkpoint.</small></span></label>
        <label className="route-map-mode">Display<select value={draft.mapMode || "geographic"} disabled={draft.checkpoints.length > 0} onChange={event => setDraft({ ...draft, mapMode: event.target.value })}><option value="geographic">Map of actual checkpoint locations</option><option value="schematic">Checkpoint layout (no GPS)</option></select><small>Choose before placing points. A layout shows walking order; use a map for actual locations.</small></label>
        <div className="route-editor-grid">
          <div className="editor-map-wrap"><div className="map-tools"><div className="segmented"><button type="button" aria-pressed={mode === "checkpoints"} onClick={() => setMode("checkpoints")}>Place checkpoints</button><button type="button" aria-pressed={mode === "path"} onClick={() => setMode("path")}>Draw path</button></div><button type="button" className="text-button" onClick={() => setFit(fit + 1)}>Fit route</button></div>
            <CheckpointMap route={draft} selectedCheckpoint={selected} onSelect={setSelected} editing onPlace={place} fitKey={fit} onMove={(id, point) => !busy && updateCheckpoints((points) => points.map((cp) => cp.id === id ? { ...cp, latitude: point[0], longitude: point[1] } : cp))} />
            <p className="editor-hint">{mode === "checkpoints" ? "Click the map to add a checkpoint. Drag a marker to adjust its position." : customPath ? "Click to extend your path. Clear the path to redraw it from the start." : "Click to start a custom path, then add points in travel order."} {draft.path.length} path points.</p>
            <div className="map-tools"><button className="text-button" type="button" disabled={!customPath || !draft.path.length} onClick={() => setDraft({ ...draft, path: draft.path.slice(0, -1) })}>Undo point</button><button className="text-button" type="button" disabled={!draft.path.length} onClick={() => { setCustomPath(true); setMode("path"); setDraft({ ...draft, path: [] }); }}>Clear path</button><button className="text-button" type="button" onClick={() => { setCustomPath(false); setDraft({ ...draft, path: draft.checkpoints.map((cp) => [cp.latitude, cp.longitude]) }); }}>Use checkpoint order</button></div>
          </div>
          <div className="checkpoint-editor"><div className="list-heading"><h3>Checkpoints</h3><span className="count-pill">{draft.checkpoints.length}</span></div>
            {!draft.checkpoints.length && <p className="muted">Start with the entrance, then add the stops along your route.</p>}
            <div className="edit-points">{draft.checkpoints.map((cp, index) => <div className={`edit-point ${selected === cp.id ? "selected" : ""}`} key={cp.id}>
              <span className="step-number">{index + 1}</span><label className="point-label"><span className="sr-only">Checkpoint {index + 1} name</span><input aria-label={`Checkpoint ${index + 1} name`} required maxLength={100} value={cp.name} onFocus={() => setSelected(cp.id)} onChange={(e) => updateCheckpoints((points) => points.map((item) => item.id === cp.id ? { ...item, name: e.target.value } : item))} /><small>{draft.mapMode === "schematic" ? `Stop ${index + 1} in the layout` : `${cp.latitude.toFixed(5)}, ${cp.longitude.toFixed(5)}`}</small></label>
              <div className="point-actions"><button type="button" aria-label={`Move ${cp.name} up`} disabled={!index} onClick={() => reorder(index, -1)}>↑</button><button type="button" aria-label={`Move ${cp.name} down`} disabled={index === draft.checkpoints.length - 1} onClick={() => reorder(index, 1)}>↓</button><button type="button" aria-label={`Remove ${cp.name}`} onClick={() => updateCheckpoints((points) => points.filter((item) => item.id !== cp.id))}>×</button></div>
            </div>)}</div>
            <details className="coordinate-entry"><summary>Add by coordinates</summary><div className="coordinate-fields"><label>Latitude<input type="number" min="-90" max="90" step="any" value={manual.latitude} onChange={(e) => setManual({ ...manual, latitude: e.target.value })} /></label><label>Longitude<input type="number" min="-180" max="180" step="any" value={manual.longitude} onChange={(e) => setManual({ ...manual, longitude: e.target.value })} /></label></div><button type="button" className="quiet-button" onClick={() => { const lat = Number(manual.latitude), lng = Number(manual.longitude); if (!manual.latitude || !manual.longitude || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) { setError("Enter valid latitude and longitude."); return; } addCheckpoint([lat, lng]); setManual({ latitude: "", longitude: "" }); setFit(fit + 1); }}>Add checkpoint</button></details>
          </div>
        </div>
      </fieldset>
      <div className="dialog-footer"><p className="error-message" role="alert">{error}</p><button type="button" className="quiet-button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save route"}</button></div>
    </form>
  </Modal>;
}

export function GroupEditor({ route, onClose, onSave }) {
  const [draft, setDraft] = useState({ routeId: route.id, name: "", leaderName: "", members: [{ name: "", tagId: "" }] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) { event.preventDefault(); setBusy(true); setError(""); try { await onSave(draft); } catch (failure) { setError(failure.message); setBusy(false); } }
  return <Modal title="Add a tracked group" onClose={onClose} busy={busy}>
    <form onSubmit={submit}><fieldset className="group-editor editor-fields" disabled={busy}>
      <p className="muted">Assign members to <strong>{route.name}</strong>. Their checkpoint visits will appear here automatically.</p>
      <label>Group name<input autoFocus required maxLength={100} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Trail group A" /></label>
      <label>Group leader<input required maxLength={100} value={draft.leaderName} onChange={(e) => setDraft({ ...draft, leaderName: e.target.value })} placeholder="Leader’s name" /></label>
      <div className="list-heading"><h3>Members</h3><span className="count-pill">{draft.members.length}</span></div>
      <p className="field-hint">For an RFID card, use the UID shown after “Card read:” in Serial Monitor (for example A9181D06), with uppercase letters and no spaces. Use the card holder’s name as the member name. Include the leader if they are also being tracked.</p>
      {draft.members.map((member, index) => <div className="member-inputs" key={index}><label>Member name<input required maxLength={100} value={member.name} onChange={(e) => setDraft({ ...draft, members: draft.members.map((item, i) => i === index ? { ...item, name: e.target.value } : item) })} /></label><label>Tracking code<input required maxLength={128} autoComplete="off" value={member.tagId} onChange={(e) => setDraft({ ...draft, members: draft.members.map((item, i) => i === index ? { ...item, tagId: e.target.value } : item) })} /></label><button type="button" className="icon-button" aria-label={`Remove member ${index + 1}`} disabled={draft.members.length === 1} onClick={() => setDraft({ ...draft, members: draft.members.filter((_, i) => i !== index) })}>×</button></div>)}
      <button className="text-button" type="button" disabled={draft.members.length >= 100} onClick={() => setDraft({ ...draft, members: [...draft.members, { name: "", tagId: "" }] })}>+ Add member</button>
    </fieldset><div className="dialog-footer"><p className="error-message" role="alert">{error}</p><button className="quiet-button" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Add group"}</button></div></form>
  </Modal>;
}
