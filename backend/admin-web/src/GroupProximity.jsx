import { useState } from "react";
import { groupProximity } from "./proximitySummary.js";
import "./group-proximity.css";

export default function GroupProximity({ group, route, monitors, onAssign, formatTime }) {
  const [setup, setSetup] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const summary = groupProximity(group, monitors);
  const available = monitors.filter((monitor) => monitor.routeId === group.routeId && !monitor.memberId && !monitor.revokedAt);
  async function assign(monitorId, memberId) {
    setSaving(true); setError("");
    try { await onAssign(monitorId, memberId); }
    catch (failure) { setError(failure.message || "Could not link this device. Try again."); }
    finally { setSaving(false); }
  }
  return <div className={`group-proximity gp-${summary.mood}`}>
    <div className="gp-toolbar">
      <div role="status"><h3>{summary.linked === 0 ? "Link devices to check proximity" : summary.title}</h3>
        <p>{summary.linked === 0 ? "Choose the device carried by each member to start monitoring." : `${summary.near} in range · ${summary.missing} outside / signal lost · ${summary.unknown} unconfirmed`}</p>
      </div>
      <button className="quiet-button" aria-pressed={setup} onClick={() => setSetup(!setup)}>{setup ? "Done linking" : "Link devices"}</button>
    </div>
    {summary.alerts > 0 && <p className="gp-alert-note">{summary.alerts} {summary.alerts === 1 ? "member needs" : "members need"} a check after more than 2 minutes out of range or without a signal.</p>}
    {error && <p role="alert" className="gp-error">{error}</p>}
    <div className="gp-table-wrap"><table className="gp-member-table">
      <caption className="sr-only">Members, checkpoint visits and proximity for {group.name}</caption>
      <thead><tr><th scope="col">Member</th><th scope="col">Last checkpoint</th><th scope="col">{setup ? "Linked device" : "Proximity"}</th></tr></thead>
      <tbody>{summary.members.map((member) => <tr className={member.alert ? "needs-check" : ""} key={member.id}>
        <td><strong>{member.name}</strong></td>
        <td><span>{route.checkpoints.find((cp) => cp.id === member.checkpointId)?.name || "Awaiting first scan"}</span>{member.lastSeen && <small>{formatTime(member.lastSeen)}</small>}</td>
        <td>{setup ? member.monitor ? <div className="gp-device-link"><span>{member.monitor.name}</span><button type="button" className="text-button" disabled={saving} onClick={() => void assign(member.monitor.id, null)}>Unlink</button></div> : <select aria-label={`Device for ${member.name}`} value="" disabled={saving || !available.length} onChange={(event) => { if (event.target.value) void assign(event.target.value, member.id); }}><option value="">{available.length ? "Choose device" : "No device available"}</option>{available.map((monitor) => <option value={monitor.id} key={monitor.id}>{monitor.name}</option>)}</select> : <><span className={`gp-status ${member.proximity}`}><i/>{member.proximity === "unlinked" ? "Not linked" : member.label}</span>{member.alert ? <small className="gp-error">Over 2 minutes · check now</small> : ["far", "lost"].includes(member.proximity) && <small>Monitoring · alerts after 2 minutes</small>}</>}</td>
      </tr>)}</tbody>
    </table></div>
    <p className="gp-footnote">{setup ? "Use the same reference phone for the group. Device links are released when a trip ends." : "Alerts appear after 2 minutes out of range. Missing updates remain unconfirmed."}</p>
  </div>;
}
