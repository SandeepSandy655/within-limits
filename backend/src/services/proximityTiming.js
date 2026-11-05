const STALE_AFTER_MS = 30_000;
const ALERT_AFTER_MS = 120_000;
const outside = (state) => state === "far" || state === "lost";

// A timer belongs to an assignment and a continuous stream of live observations.
// Persist server receipt time so delayed uploads cannot trigger an instant alert.
function nextOutOfRangeSince(monitor, previous, report, receivedAt = Date.now()) {
  if (!monitor.member_id || !monitor.assigned_at) return null;
  const observedAt = Date.parse(report.observedAt);
  const assignedAt = new Date(monitor.assigned_at).getTime();
  const since = monitor.out_of_range_since;
  const previousAt = previous ? new Date(previous.observed_at).getTime() : NaN;
  if (observedAt < assignedAt) return since || null;
  if (observedAt < previousAt) {
    // A late recovery inside this episode invalidates its earlier start.
    if (since && !outside(report.state) && observedAt >= new Date(since).getTime()) return null;
    return since || null;
  }
  if (!outside(report.state) || receivedAt - observedAt > STALE_AFTER_MS) return null;
  const continuous = previous && outside(previous.state) && observedAt - previousAt <= STALE_AFTER_MS
    && receivedAt - new Date(previous.received_at).getTime() <= STALE_AFTER_MS;
  return since && continuous ? since : new Date(Math.max(receivedAt, observedAt, assignedAt));
}

function proximityAlert(row, now = Date.now()) {
  const since = row.outOfRangeSince && new Date(row.outOfRangeSince).getTime();
  return Boolean(row.online && row.assignmentFresh && row.groupId && row.memberId && outside(row.state)
    && Number.isFinite(since) && since <= now - ALERT_AFTER_MS);
}

module.exports = { STALE_AFTER_MS, ALERT_AFTER_MS, nextOutOfRangeSince, proximityAlert };
