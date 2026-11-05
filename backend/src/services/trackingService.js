const { randomUUID, createHash } = require("node:crypto");
const { pool, withTransaction } = require("../config/database");
const { InputError, id, routeInput, groupInput, reportInput } = require("./trackingValidation");
const { registerTrip, finishTripIfComplete } = require("./tripLifecycle");
const { getProximityOverview } = require("./proximityService");

const STALE_AFTER_MS = 5 * 60_000;
const hashToken = (token) => createHash("sha256").update(token).digest("hex");
async function accessibleRoute(client, routeId, admin, lock = false) {
  const result = await client.query(`SELECT * FROM monitoring_routes WHERE id = $1 AND archived_at IS NULL AND ($2 = 'super_admin' OR owner_uid = $3)${lock ? " FOR UPDATE" : ""}`, [id(routeId, "Route ID"), admin.role, admin.uid]);
  if (!result.rowCount) throw new InputError("Route not found.", 404);
  return result.rows[0];
}
async function saveRoute(body, routeId, admin) {
  const route = routeInput(body);
  return withTransaction(async (client) => {
    const key = routeId ? id(routeId, "Route ID") : randomUUID();
    if (routeId) {
      const existing = await accessibleRoute(client, key, admin, true);
      if (body.revision !== existing.revision) throw new InputError("This route was changed elsewhere. Close the editor, refresh, and try again.", 409);
      if (route.mapMode && route.mapMode !== existing.map_mode && (await client.query("SELECT 1 FROM checkpoint_reports WHERE route_id=$1 LIMIT 1", [key])).rowCount) throw new InputError("Create a new route to change the map type after scans have been recorded.", 409);
      const existingPoints = await client.query(`SELECT c.id, c.latitude, c.longitude,
        EXISTS (SELECT 1 FROM checkpoint_reports r WHERE r.checkpoint_id = c.id) AS visited
        FROM checkpoints c WHERE route_id = $1 ORDER BY position, id`, [key]);
      const hasTripHistory = (await client.query(`SELECT 1 FROM tracking_members m JOIN tracked_groups g ON g.id = m.group_id
        WHERE g.route_id = $1 AND m.trip_started_at IS NOT NULL LIMIT 1`, [key])).rowCount;
      if (hasTripHistory && (existingPoints.rows.length !== route.checkpoints.length || existingPoints.rows.some((cp, i) => cp.id !== route.checkpoints[i].id))) {
        throw new InputError("A route with started trips cannot change checkpoint order or membership. Create a new route.", 409);
      }
      if (existing.auto_enroll && route.autoEnroll === false && (await client.query(`SELECT 1 FROM tracking_members m JOIN tracked_groups g ON g.id = m.group_id WHERE g.route_id = $1 AND m.active LIMIT 1`, [key])).rowCount) {
        throw new InputError("Finish the active trips before turning off automatic registration.", 409);
      }
      for (const cp of existingPoints.rows.filter((point) => point.visited)) {
        const next = route.checkpoints.find((point) => point.id === cp.id);
        if (next && (next.latitude !== cp.latitude || next.longitude !== cp.longitude)) {
          throw new InputError("A visited checkpoint cannot be moved. Create a new route to keep earlier visits accurate.", 409);
        }
      }
      const removed = existingPoints.rows.filter((cp) => !route.checkpoints.some((next) => next.id === cp.id)).map((cp) => cp.id);
      const used = await client.query(`SELECT 1 FROM checkpoints c WHERE c.id = ANY($1::uuid[]) AND (EXISTS (SELECT 1 FROM checkpoint_reporters r WHERE r.checkpoint_id = c.id) OR EXISTS (SELECT 1 FROM checkpoint_reports r WHERE r.checkpoint_id = c.id)) LIMIT 1`, [removed]);
      if (used.rowCount) throw new InputError("A checkpoint already assigned for reporting cannot be removed. Create a new route for a different journey.", 409);
      await client.query("DELETE FROM checkpoints WHERE id = ANY($1::uuid[])", [removed]);
      await client.query("UPDATE monitoring_routes SET name = $2, region = $3, path = $4::jsonb, auto_enroll = $5, revision = revision + 1 WHERE id = $1", [key, route.name, route.region, JSON.stringify(route.path), route.autoEnroll ?? existing.auto_enroll]);
    } else {
      await client.query("INSERT INTO monitoring_routes (id, owner_uid, name, region, path, auto_enroll) VALUES ($1, $2, $3, $4, $5::jsonb, $6)", [key, admin.uid, route.name, route.region, JSON.stringify(route.path), route.autoEnroll ?? false]);
    }
    if (route.mapMode !== undefined) await client.query("UPDATE monitoring_routes SET map_mode=$2 WHERE id=$1", [key, route.mapMode]);
    for (const [position, cp] of route.checkpoints.entries()) {
      const saved = await client.query(`INSERT INTO checkpoints (id, route_id, name, position, latitude, longitude) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, position = EXCLUDED.position, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude
         WHERE checkpoints.route_id = EXCLUDED.route_id RETURNING id`, [cp.id, key, cp.name, position, cp.latitude, cp.longitude]);
      if (!saved.rowCount) throw new InputError("A checkpoint belongs to another route.", 409);
    }
    return key;
  });
}
async function createGroup(body, admin) {
  const group = groupInput(body);
  return withTransaction(async (client) => {
    await accessibleRoute(client, group.routeId, admin, true);
    const key = randomUUID();
    await client.query("INSERT INTO tracked_groups (id, route_id, name, leader_name) VALUES ($1,$2,$3,$4)", [key, group.routeId, group.name, group.leaderName]);
    for (const member of [...group.members].sort((a, b) => a.tagId.localeCompare(b.tagId))) {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('tracking-card:' || $1))", [member.tagId]);
      await client.query("INSERT INTO tracking_members (id, group_id, name, tag_id) VALUES ($1,$2,$3,$4)", [member.id, key, member.name, member.tagId]);
    }
    return key;
  });
}
async function getOverview(admin) {
  const routesResult = await pool.query(`SELECT id, name, region, path, revision, map_mode AS "mapMode", auto_enroll AS "autoEnroll",
    (SELECT COUNT(*)::int FROM tracked_groups g WHERE g.route_id=monitoring_routes.id AND g.completed_at IS NOT NULL) AS "completedGroups",
    (SELECT COUNT(*)::int FROM tracking_members m JOIN tracked_groups g ON g.id = m.group_id WHERE g.route_id = monitoring_routes.id AND m.exited_at IS NOT NULL) AS "exitedCount"
    FROM monitoring_routes WHERE archived_at IS NULL AND ($1 = 'super_admin' OR owner_uid = $2) ORDER BY created_at, id`, [admin.role, admin.uid]);
  const routeIds = routesResult.rows.map((route) => route.id);
  const [checkpointsResult, groupsResult, membersResult, visitsResult, completedResult] = await Promise.all([
    pool.query(`SELECT id, route_id AS "routeId", name, latitude, longitude FROM checkpoints WHERE route_id = ANY($1::uuid[]) ORDER BY position, id`, [routeIds]),
    pool.query(`SELECT g.id, g.route_id AS "routeId", g.name, g.leader_name AS "leaderName", g.auto_enroll AS "autoEnroll",
      (SELECT COUNT(*)::int FROM tracking_members m WHERE m.group_id=g.id) AS "totalMembers",
      (SELECT COUNT(*)::int FROM tracking_members m WHERE m.group_id=g.id AND m.exited_at IS NOT NULL) AS "finishedMembers"
      FROM tracked_groups g WHERE route_id = ANY($1::uuid[]) AND g.completed_at IS NULL AND EXISTS (SELECT 1 FROM tracking_members m WHERE m.group_id = g.id AND m.active) ORDER BY created_at, id`, [routeIds]),
    pool.query(`SELECT m.id, m.group_id AS "groupId", m.name, m.tag_id AS "tagId", m.trip_started_at AS "tripStartedAt", r.checkpoint_id AS "checkpointId", r.observed_at AS "lastSeen"
      FROM tracking_members m JOIN tracked_groups g ON g.id = m.group_id
      LEFT JOIN LATERAL (SELECT checkpoint_id, observed_at FROM checkpoint_reports WHERE member_id = m.id ORDER BY observed_at DESC, id DESC LIMIT 1) r ON TRUE
      WHERE m.active AND g.route_id = ANY($1::uuid[]) ORDER BY m.name, m.id`, [routeIds]),
    pool.query(`SELECT r.group_id AS "groupId", r.checkpoint_id AS "checkpointId", COUNT(DISTINCT r.member_id)::int AS seen, MAX(r.observed_at) AS "lastSeen"
      FROM checkpoint_reports r JOIN tracking_members m ON m.id = r.member_id WHERE m.active AND r.route_id = ANY($1::uuid[])
      AND (m.trip_started_at IS NULL OR r.observed_at >= m.trip_started_at) GROUP BY r.group_id, r.checkpoint_id`, [routeIds]),
    pool.query(`SELECT recent.* FROM monitoring_routes route JOIN LATERAL (
      SELECT m.id AS "memberId", m.name AS "memberName", g.id AS "groupId", g.name AS "groupName", g.route_id AS "routeId",
        m.trip_started_at AS "startedAt", m.exited_at AS "exitedAt", cp.id AS "checkpointId", cp.name AS "checkpointName"
      FROM tracking_members m JOIN tracked_groups g ON g.id = m.group_id
      JOIN LATERAL (SELECT id, name FROM checkpoints WHERE route_id = g.route_id ORDER BY position DESC, id DESC LIMIT 1) cp ON TRUE
      WHERE g.route_id = route.id AND m.exited_at IS NOT NULL ORDER BY m.exited_at DESC, m.id LIMIT 50
    ) recent ON TRUE WHERE route.id = ANY($1::uuid[]) ORDER BY recent."exitedAt" DESC`, [routeIds]),
  ]);
  const routes = routesResult.rows.map((route) => ({ ...route, checkpoints: checkpointsResult.rows.filter((cp) => cp.routeId === route.id) }));
  const now = Date.now();
  const groups = groupsResult.rows.map((group) => {
    const members = membersResult.rows.filter((member) => member.groupId === group.id).map((member) => ({ ...member, status: !member.lastSeen ? "waiting" : now - new Date(member.lastSeen).getTime() > STALE_AFTER_MS ? "stale" : "active" }));
    const visits = visitsResult.rows.filter((visit) => visit.groupId === group.id);
    const latest = members.filter((member) => member.lastSeen).sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen))[0];
    return { ...group, members, visits, lastSeen: latest?.lastSeen || null, checkpointId: latest?.checkpointId || null,
      status: !latest ? "waiting" : members.some((member) => member.status !== "active") ? "attention" : "active",
      completedCheckpoints: visits.filter((visit) => visit.seen === members.length).length };
  });
  return { success: true, generatedAt: new Date(now).toISOString(), staleAfterSeconds: STALE_AFTER_MS / 1000, routes, groups, completedTrips: completedResult.rows, proximityMonitors: await getProximityOverview(routeIds, now) };
}
async function receiveReport(token, body) {
  if (typeof token !== "string" || token.length < 32 || token.length > 300) throw new InputError("Invalid reporting credential.", 401);
  return withTransaction(async (client) => {
    // Revocation waits for already accepted in-flight requests to finish.
    const reporterResult = await client.query(`SELECT r.id, r.checkpoint_id, c.route_id, c.name AS checkpoint_name FROM checkpoint_reporters r JOIN checkpoints c ON c.id = r.checkpoint_id WHERE r.token_hash = $1 AND r.revoked_at IS NULL FOR SHARE OF r`, [hashToken(token)]);
    const reporter = reporterResult.rows[0];
    if (!reporter) throw new InputError("Invalid reporting credential.", 401);
    // Serialize observations with route edits so a saved visit cannot race a checkpoint move.
    const route = (await client.query("SELECT * FROM monitoring_routes WHERE id = $1 FOR UPDATE", [reporter.route_id])).rows[0];
    if (route.archived_at) throw new InputError("This route is archived. Use the college route reader credential.", 410);
    const report = reportInput(body);
    if (route.data_cleared_at && new Date(report.observedAt) <= new Date(route.data_cleared_at)) {
      throw new InputError("This scan predates the data reset. Scan the card again at the entrance.", 422);
    }
    // A retry must resolve against its historical assignment, even after release/re-entry.
    const previous = (await client.query(`SELECT m.tag_id, m.name, r.observed_at FROM checkpoint_reports r JOIN tracking_members m ON m.id = r.member_id
      WHERE r.reporter_id = $1 AND r.event_id = $2`, [reporter.id, report.eventId])).rows[0];
    if (previous) {
      if (previous.tag_id !== report.tagId || new Date(previous.observed_at).toISOString() !== report.observedAt) throw new InputError("eventId has already been used for a different observation.", 409);
      return { success: true, duplicate: true, memberName: previous.name, receivedAt: new Date().toISOString() };
    }
    await client.query("SELECT pg_advisory_xact_lock(hashtext('tracking-card:' || $1))", [report.tagId]);
    const checkpoints = (await client.query("SELECT id, name FROM checkpoints WHERE route_id = $1 ORDER BY position, id", [route.id])).rows;
    let member = (await client.query(`SELECT m.id, m.group_id, m.name, m.trip_started_at, g.created_at, g.route_id FROM tracking_members m
      JOIN tracked_groups g ON g.id = m.group_id WHERE m.tag_id = $1 AND m.active`, [report.tagId])).rows[0];
    if (member && member.route_id !== route.id) throw new InputError("This card is active on another route.", 422);
    const registered = !member;
    if (!member) member = await registerTrip(client, route, report, reporter.checkpoint_id, checkpoints);
    if (new Date(report.observedAt) < new Date(member.trip_started_at || member.created_at)) throw new InputError("The observation predates this trip assignment.", 422);
    if (!member.trip_started_at) {
      if (reporter.checkpoint_id !== checkpoints[0]?.id) throw new InputError("Scan at the entrance to start this trip.", 422);
      member.trip_started_at = report.observedAt;
      await client.query("UPDATE tracking_members SET trip_started_at = $2 WHERE id = $1", [member.id, report.observedAt]);
    }
    await client.query(`INSERT INTO checkpoint_reports (reporter_id, event_id, route_id, checkpoint_id, group_id, member_id, observed_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`, [reporter.id, report.eventId, reporter.route_id, reporter.checkpoint_id, member.group_id, member.id, report.observedAt]);
    const progress = await finishTripIfComplete(client, member, checkpoints);
    const exited = Boolean(progress?.completedAt);
    return { success: true, duplicate: false, registered, memberName: member.name, tripStatus: exited ? "exited" : "active",
      message: exited ? `${member.name} completed the route and exited.` : `${member.name} ${registered ? "registered at" : "reached"} ${reporter.checkpoint_name}.`,
      receivedAt: new Date().toISOString() };
  });
}
module.exports = { saveRoute, createGroup, getOverview, receiveReport, hashToken };
