import { latestArrivals } from "./arrivals";

export default function ArrivalFeed({ route, groups, completedTrips = [], formatTime, onChoose }) {
  const arrivals = latestArrivals(route, groups, 8, completedTrips);
  return <section className="panel arrivals-panel" aria-labelledby="arrivals-heading">
    <div className="panel-heading"><h2 id="arrivals-heading">Latest trip updates</h2><span className="count-pill">{arrivals.length}</span></div>
    <p className="arrivals-description">Registration, arrivals and completed trips.</p>
    <div className="arrival-list" aria-live="polite" aria-relevant="additions text">
      {arrivals.length ? arrivals.map((arrival) => <button type="button" className="arrival-card" key={arrival.memberId} onClick={() => onChoose(arrival)}>
        <span className="arrival-check" aria-hidden="true">{arrival.exited ? "↗" : "✓"}</span><span className="arrival-copy"><span><strong>{arrival.memberName}</strong> {arrival.exited ? <>exited at <strong>{arrival.checkpointName}</strong>.</> : <>{arrival.registered ? "registered at" : "reached"} <strong>{arrival.checkpointName}</strong>.</>}</span><small><span>{arrival.exited ? "Route completed · card released" : arrival.incompleteExit ? "Route incomplete · visit missing stops, then Exit" : arrival.groupName}</span><time dateTime={arrival.observedAt}>{formatTime(arrival.observedAt)}</time></small></span><span className="row-arrow" aria-hidden="true">›</span>
      </button>) : <p className="arrivals-empty">{!route ? "Set up a route to start following card trips." : route.autoEnroll ? `Scan a card at ${route.checkpoints[0]?.name || "the first checkpoint"} to register a new trip automatically.` : !groups.length ? "Add a tracked group and assign each member their card's tracking code." : "Waiting for the first card scan at a connected checkpoint reader."}</p>}
    </div>
    <p className="arrivals-footnote">{route?.autoEnroll ? "Exiting completes the trip and releases the card. Its next entrance scan starts a fresh trip." : "A scan records arrival at that checkpoint; the person may have moved since then."}</p>
  </section>;
}
