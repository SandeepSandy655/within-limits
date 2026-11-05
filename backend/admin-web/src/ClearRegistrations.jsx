import { useEffect, useRef, useState } from "react";

export default function ClearRegistrations({ route, onLoad, onClear, onClose }) {
  const dialog = useRef(null);
  const [summary, setSummary] = useState(null);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const element = dialog.current;
    const previous = document.activeElement;
    element.showModal();
    onLoad().then((data) => { if (active) setSummary(data); }).catch((failure) => { if (active) setError(failure.message); });
    return () => { active = false; element.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  async function submit(event) {
    event.preventDefault();
    if (!summary || busy || confirmation.trim() !== route.name) return;
    setBusy(true); setError("");
    try { await onClear(confirmation.trim()); }
    catch (failure) { setError(failure.message || "Could not clear the data. Try again."); setBusy(false); }
  }
  return <dialog ref={dialog} className="editor-dialog clear-data-dialog" aria-labelledby="clear-data-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="dialog-heading"><h2 id="clear-data-title">Clear registered data</h2><button className="icon-button" aria-label="Close reset" onClick={onClose} disabled={busy}>×</button></div>
    <form onSubmit={submit}>
      <div className="clear-data-body">
        <p>Start a fresh test on <strong>{route.name}</strong>.</p>
        {summary ? <div className="reset-counts"><span><strong>{summary.cards}</strong> cards</span><span><strong>{summary.groups}</strong> groups</span><span><strong>{summary.checkpointVisits}</strong> checkpoint scans</span><span><strong>{summary.completedTrips}</strong> completed trips</span></div> : !error && <p role="status">Checking registered data…</p>}
        <p>This permanently removes this route’s groups, card registrations, trip history and proximity reports. Routes, checkpoints and hardware credentials stay configured.</p>
        <p>Remove cards from the readers first. New entrance scans register cards again.</p>
        <label htmlFor="confirm-route-reset">Type “{route.name}” to confirm<input id="confirm-route-reset" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={busy || !summary} autoComplete="off"/></label>
        {error && <p className="error-message" role="alert">{error}</p>}
      </div>
      <div className="dialog-footer"><button type="button" className="quiet-button" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="primary-button danger-button" disabled={busy || !summary || confirmation.trim() !== route.name}>{busy ? "Clearing…" : "Clear data"}</button></div>
    </form>
  </dialog>;
}
