import { useEffect, useState } from "react";

export default function GroupHistory({ routes, request, revision, formatTime }) {
  const [routeId, setRouteId] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true; setLoading(true); setError("");
    request(`/history?page=${page}${routeId ? `&routeId=${routeId}` : ""}`).then(data => { if (active) setResult(data); }).catch(failure => { if (active) setError(failure.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [routeId, page, revision]);
  useEffect(() => {
    let active = true; setDetail(null); if (!selected) return;
    request(`/history/${selected}`).then(data => { if (active) setDetail(data); }).catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [selected]);
  return <section className="history-page" aria-label="Route history">
    <div className="history-toolbar"><div><h2>Completed route history</h2><p>Every group’s completed journey, with its members and checkpoint log.</p></div><label>Route<select value={routeId} onChange={event => { setRouteId(event.target.value); setPage(1); setSelected(""); }}><option value="">All routes</option>{routes.map(route => <option key={route.id} value={route.id}>{route.name}</option>)}</select></label></div>
    {error && <p className="notice notice-error" role="alert">{error}</p>}
    {loading && !result && <p className="home-empty" role="status">Loading history…</p>}
    {!loading && !result?.groups.length && !error && <div className="home-empty history-empty"><span className="home-empty-icon" aria-hidden="true">◷</span><h3>No completed groups yet</h3><p>A group moves here automatically when every member has visited all checkpoints in order.</p></div>}
    <div className="history-list">{result?.groups.map(group => <article className="history-card" key={group.id}><button className="history-card-summary" aria-expanded={selected === group.id} onClick={() => setSelected(selected === group.id ? "" : group.id)}><span className="history-check" aria-hidden="true">✓</span><span><strong>{group.name}</strong><small>{group.routeName} · {group.memberCount} members</small></span><span className="history-date">Completed {formatTime(group.completedAt)}</span><span aria-hidden="true">{selected === group.id ? "−" : "+"}</span></button>
      {selected === group.id && <div className="history-detail">{!detail ? <p role="status">Loading checkpoint log…</p> : <><div className="history-detail-heading"><h3>Checkpoint log</h3><span>{detail.scans.length} scans · {detail.group.route?.region}</span></div><div className="history-members">{detail.members.map(member => <span key={member.id}>{member.name} <small>Finished {formatTime(member.exitedAt)}</small></span>)}</div><div className="table-scroll"><table><caption className="sr-only">Checkpoint log for {group.name}</caption><thead><tr><th>Member</th><th>Checkpoint</th><th>Scanned at</th></tr></thead><tbody>{detail.scans.map(scan => <tr key={scan.id}><td>{scan.memberName}</td><td>{scan.checkpointName}</td><td>{formatTime(scan.observedAt)}</td></tr>)}</tbody></table></div></>}</div>}
    </article>)}</div>
    {result?.total > 0 && <div className="history-pagination"><span>{result.total} completed groups · Page {result.page} of {result.totalPages}</span><button className="quiet-button" disabled={loading || page <= 1} onClick={() => { setPage(page - 1); setSelected(""); }}>Previous</button><button className="quiet-button" disabled={loading || page >= result.totalPages} onClick={() => { setPage(page + 1); setSelected(""); }}>Next</button></div>}
  </section>;
}
