const { pool, withTransaction } = require("../config/database");
const { id, InputError } = require("./trackingValidation");

async function ownedRoute(client, routeId, admin, lock = false) {
  const result = await client.query(`SELECT * FROM monitoring_routes WHERE id=$1 AND ($2='super_admin' OR owner_uid=$3)${lock ? " FOR UPDATE" : ""}`, [id(routeId, "Route ID"), admin.role, admin.uid]);
  if (!result.rowCount) throw new InputError("Route not found.", 404);
  return result.rows[0];
}

async function counts(client, routeId) {
  return (await client.query(`SELECT
    (SELECT COUNT(*)::int FROM tracked_groups WHERE route_id=$1) AS groups,
    (SELECT COUNT(*)::int FROM tracking_members m JOIN tracked_groups g ON g.id=m.group_id WHERE g.route_id=$1) AS registrations,
    (SELECT COUNT(DISTINCT m.tag_id)::int FROM tracking_members m JOIN tracked_groups g ON g.id=m.group_id WHERE g.route_id=$1) AS cards,
    (SELECT COUNT(*)::int FROM tracking_members m JOIN tracked_groups g ON g.id=m.group_id WHERE g.route_id=$1 AND m.exited_at IS NOT NULL) AS "completedTrips",
    (SELECT COUNT(*)::int FROM checkpoint_reports WHERE route_id=$1) AS "checkpointVisits",
    (SELECT COUNT(*)::int FROM proximity_reports p JOIN proximity_monitors m ON m.id=p.monitor_id WHERE m.route_id=$1) AS "proximityReports"`, [routeId])).rows[0];
}

async function registrationSummary(routeId, admin) {
  const route = await ownedRoute(pool, routeId, admin);
  return { success: true, routeId: route.id, routeName: route.name, ...await counts(pool, route.id) };
}

async function clearRegistrations(routeId, admin, confirmation, beforeClear) {
  return withTransaction(async (client) => {
    // Same lock order as registration, trip completion and board assignment.
    const route = await ownedRoute(client, routeId, admin, true);
    if (confirmation !== route.name) throw new InputError("Type the route name to confirm clearing its registered data.");
    await client.query("SELECT id FROM proximity_monitors WHERE route_id=$1 ORDER BY id FOR UPDATE", [route.id]);
    const deleted = await counts(client, route.id);
    if (beforeClear) await beforeClear(client, route);
    const clearedAt = (await client.query("SELECT clock_timestamp() AS at")).rows[0].at;
    await client.query("UPDATE proximity_monitors SET member_id=NULL,assigned_at=NULL,out_of_range_since=NULL,reports_cleared_at=$2 WHERE route_id=$1", [route.id, clearedAt]);
    await client.query("DELETE FROM proximity_reports p USING proximity_monitors m WHERE p.monitor_id=m.id AND m.route_id=$1", [route.id]);
    await client.query("DELETE FROM checkpoint_reports WHERE route_id=$1", [route.id]);
    await client.query("DELETE FROM tracking_members m USING tracked_groups g WHERE m.group_id=g.id AND g.route_id=$1", [route.id]);
    await client.query("DELETE FROM tracked_groups WHERE route_id=$1", [route.id]);
    await client.query("UPDATE monitoring_routes SET next_person_number=1,data_cleared_at=$2,revision=revision+1 WHERE id=$1", [route.id, clearedAt]);
    return { success: true, routeId: route.id, routeName: route.name, clearedAt, deleted };
  });
}

module.exports = { registrationSummary, clearRegistrations };
