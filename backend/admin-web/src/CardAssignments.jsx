import { useState } from 'react';

function CardRow({ member, groupName, onRename }) {
  const [name, setName] = useState(member.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { await onRename(member.id, name.trim()); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <form className="card-assignment-row" onSubmit={save}>
    <div><code>{member.tagId || 'Registered card'}</code><small>{groupName}</small></div>
    <label><span className="sr-only">Name for {member.tagId || member.name}</span><input value={name} maxLength={100} required disabled={busy} onChange={event => setName(event.target.value)} /></label>
    <button className="quiet-button" disabled={busy || !name.trim() || name.trim() === member.name}>{busy ? 'Saving…' : 'Save name'}</button>
    {error && <p className="error-message" role="alert">{error}</p>}
  </form>;
}

export default function CardAssignments({ route, groups, onRename }) {
  const members = groups.flatMap(group => group.members.map(member => ({ ...member, groupName: group.name })));
  return <section className="panel card-assignments" aria-label="Card registration">
    <div className="panel-heading"><div><h2>Cards & people</h2><p className="section-description">{route.autoEnroll ? `Scan the next card at ${route.checkpoints[0]?.name || 'the entrance'}. It registers automatically, then you can add its holder’s name.` : 'Automatic registration is off. Enable it in Edit route or assign cards with Add group.'}</p></div><span className="count-pill">{members.length}</span></div>
    {route.autoEnroll && <p className="card-registration-state"><span aria-hidden="true">●</span> Ready for the next entrance scan · Cards are released after the complete route</p>}
    {!members.length ? <p className="muted">No cards assigned yet. New scans appear here after the next sync.</p> : members.map(member => <CardRow key={`${member.id}:${member.name}`} member={member} groupName={member.groupName} onRename={onRename} />)}
  </section>;
}
