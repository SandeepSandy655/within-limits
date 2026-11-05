export default function CompletedTrips({ route, trips, formatTime, hidden = false }) {
  const completed = trips.filter((trip) => trip.routeId === route?.id);
  return <section className="panel completed-trips" id="completed-trips" aria-labelledby="completed-trips-heading" hidden={hidden}>
    <div className="panel-heading"><div><h2 id="completed-trips-heading">Completed trips <span className="count-pill">{route?.exitedCount || 0}</span></h2><p className="section-description">Exited people are removed from active tracking. Their cards can start another trip at the entrance.</p></div></div>
    {completed.length ? <div className="table-scroll" role="region" aria-label="Completed trip records" tabIndex={0}><table><caption className="sr-only">Completed trips on {route?.name}</caption><thead><tr><th scope="col">Person</th><th scope="col">Trip started</th><th scope="col">Exit checkpoint</th><th scope="col">Exited at</th></tr></thead><tbody>{completed.map((trip) => <tr key={trip.memberId}><td><strong>{trip.memberName} exited.</strong><small className="released-card">Route completed · card released</small></td><td>{formatTime(trip.startedAt)}</td><td>{trip.checkpointName}</td><td><time dateTime={trip.exitedAt}>{formatTime(trip.exitedAt)}</time></td></tr>)}</tbody></table></div> : <p className="arrivals-empty completed-empty">Completed trips will appear here after the final checkpoint scan.</p>}
    {completed.length > 0 && <p className="detail-footnote">Showing the latest {completed.length} completed trips for this route. Earlier trip records are retained.</p>}
  </section>;
}
