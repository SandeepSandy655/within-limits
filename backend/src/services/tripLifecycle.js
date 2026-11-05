const { randomUUID } = require('node:crypto');
const { InputError } = require('./trackingValidation');

// Reports may arrive out of order. Completion depends on observation order.
function orderedProgress(checkpoints, reports) {
  let next = 0,
    cursor = -Infinity;
  const ordered = [...reports].sort(
    (a, b) => new Date(a.observedAt) - new Date(b.observedAt)
  );
  for (const checkpoint of checkpoints) {
    // Equal timestamps are allowed: the ESP32 currently reports whole seconds.
    const report = ordered.find(
      (item) =>
        item.checkpointId === checkpoint.id &&
        new Date(item.observedAt).getTime() >= cursor
    );
    if (!report) break;
    cursor = new Date(report.observedAt).getTime();
    next++;
    if (next === checkpoints.length)
      return { visited: next, completedAt: report.observedAt };
  }
  return { visited: next, completedAt: null };
}

async function registerTrip(client, route, report, checkpointId, checkpoints) {
  if (!route.auto_enroll || checkpoints[0]?.id !== checkpointId)
    throw new InputError(
      'Scan this unassigned card at the route entrance to register a trip.',
      422
    );
  if (new Date(report.observedAt) < new Date(route.created_at))
    throw new InputError('The observation predates this route.', 422);
  const closed = await client.query(
    'SELECT MAX(exited_at) AS exited_at FROM tracking_members WHERE tag_id = $1',
    [report.tagId]
  );
  if (
    closed.rows[0].exited_at &&
    new Date(report.observedAt) <= new Date(closed.rows[0].exited_at)
  ) {
    throw new InputError(
      'This observation belongs to a completed trip. Scan again at the entrance to start a new trip.',
      422
    );
  }
  let group = (
    await client.query(
      'SELECT id, created_at FROM tracked_groups WHERE route_id = $1 AND auto_enroll AND completed_at IS NULL',
      [route.id]
    )
  ).rows[0];
  if (!group) {
    group = (
      await client.query(
        "INSERT INTO tracked_groups (id, route_id, name, leader_name, auto_enroll) VALUES ($1,$2,'RFID trips','Automatic registration',TRUE) RETURNING id, created_at",
        [randomUUID(), route.id]
      )
    ).rows[0];
  }
  const number = await client.query(
    `UPDATE monitoring_routes SET next_person_number = GREATEST(next_person_number,
    (SELECT COALESCE(MAX(substring(m.name FROM 8)::int), 0) + 1 FROM tracking_members m JOIN tracked_groups g ON g.id = m.group_id
      WHERE g.route_id = $1 AND m.name ~ '^Person [1-9][0-9]{0,8}$')) + 1 WHERE id = $1 RETURNING next_person_number - 1 AS value`,
    [route.id]
  );
  const name = `Person ${number.rows[0].value}`;
  const member = (
    await client.query(
      `INSERT INTO tracking_members (id, group_id, name, tag_id, trip_started_at) VALUES ($1,$2,$3,$4,$5)
    RETURNING id, group_id, name, trip_started_at`,
      [randomUUID(), group.id, name, report.tagId, report.observedAt]
    )
  ).rows[0];
  return { ...member, created_at: group.created_at, route_id: route.id };
}

async function finishTripIfComplete(client, member, checkpoints) {
  const reports = await client.query(
    `SELECT checkpoint_id AS "checkpointId", observed_at AS "observedAt" FROM checkpoint_reports
    WHERE member_id = $1 AND observed_at >= $2 ORDER BY observed_at, id`,
    [member.id, member.trip_started_at]
  );
  const progress = orderedProgress(checkpoints, reports.rows);
  if (progress.completedAt) {
    await client.query(
      'UPDATE proximity_monitors SET member_id=NULL,assigned_at=NULL,out_of_range_since=NULL WHERE member_id=$1',
      [member.id]
    );
    await client.query(
      'UPDATE tracking_members SET active = FALSE, exited_at = $2 WHERE id = $1',
      [member.id, progress.completedAt]
    );
    await client.query(`UPDATE tracked_groups g SET completed_at=(SELECT MAX(exited_at) FROM tracking_members WHERE group_id=g.id),
      route_snapshot=(SELECT jsonb_build_object('id',r.id,'name',r.name,'region',r.region,'path',r.path,'mapMode',r.map_mode,
        'checkpoints',(SELECT jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'latitude',c.latitude,'longitude',c.longitude) ORDER BY c.position,c.id) FROM checkpoints c WHERE c.route_id=r.id)) FROM monitoring_routes r WHERE r.id=g.route_id)
      WHERE g.id=$1 AND g.completed_at IS NULL AND NOT EXISTS (SELECT 1 FROM tracking_members WHERE group_id=g.id AND (active OR exited_at IS NULL))`, [member.group_id]);
  }
  return progress;
}

module.exports = { orderedProgress, registerTrip, finishTripIfComplete };
