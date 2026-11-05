export default function ProximityAlerts({ alerts, onOpenGroup }) {
  if (!alerts.length) return null;
  return <section className="proximity-alerts" role="alert" aria-label="Proximity alerts">
    <div><strong>Proximity alert</strong><p>Check on members who have been out of range or lost signal for more than 2 minutes.</p></div>
    <ul>{alerts.map(({ group, member }) => <li key={member.id}>
      <span><strong>{member.name}</strong><small>{group.name} · {member.label}</small></span>
      <button className="quiet-button" onClick={() => onOpenGroup(group)}>View group</button>
    </li>)}</ul>
  </section>;
}
