const { pool } = require("../config/database");
const { id, InputError } = require("./trackingValidation");

async function getGroupHistory(admin, query = {}) {
  const routeId = query.routeId ? id(query.routeId, "Route ID") : null;
  const page = query.page === undefined ? 1 : Number(query.page);
  if (!Number.isInteger(page) || page < 1 || page > 100000) throw new InputError("Choose a valid history page.");
  const where = "g.completed_at IS NOT NULL AND r.archived_at IS NULL AND ($1='super_admin' OR r.owner_uid=$2) AND ($3::uuid IS NULL OR r.id=$3)";
  const scope = [admin.role, admin.uid, routeId];
  const total = (await pool.query(`SELECT COUNT(*)::int AS total FROM tracked_groups g JOIN monitoring_routes r ON r.id=g.route_id WHERE ${where}`, scope)).rows[0].total;
  const rows = (await pool.query(`SELECT g.id,g.name,g.leader_name AS "leaderName",g.route_id AS "routeId",g.completed_at AS "completedAt",
    COALESCE(g.route_snapshot->>'name',r.name) AS "routeName",COALESCE(g.route_snapshot->>'region',r.region) AS region,
    (SELECT COUNT(*)::int FROM tracking_members WHERE group_id=g.id) AS "memberCount",
    (SELECT MIN(trip_started_at) FROM tracking_members WHERE group_id=g.id) AS "startedAt"
    FROM tracked_groups g JOIN monitoring_routes r ON r.id=g.route_id WHERE ${where}
    ORDER BY g.completed_at DESC,g.id DESC LIMIT 20 OFFSET $4`, [...scope, (page - 1) * 20])).rows;
  return { success: true, groups: rows, page, pageSize: 20, total, totalPages: Math.ceil(total / 20) };
}

async function getGroupHistoryDetails(groupId, admin) {
  const group = (await pool.query(`SELECT g.id,g.name,g.leader_name AS "leaderName",g.route_id AS "routeId",g.completed_at AS "completedAt",g.route_snapshot AS route
    FROM tracked_groups g JOIN monitoring_routes r ON r.id=g.route_id
    WHERE g.id=$1 AND g.completed_at IS NOT NULL AND ($2='super_admin' OR r.owner_uid=$3)`, [id(groupId, "Group ID"), admin.role, admin.uid])).rows[0];
  if (!group) throw new InputError("Completed group not found.", 404);
  const members = (await pool.query(`SELECT id,name,trip_started_at AS "startedAt",exited_at AS "exitedAt" FROM tracking_members WHERE group_id=$1 ORDER BY name,id`, [group.id])).rows;
  const scans = (await pool.query(`SELECT id,member_id AS "memberId",checkpoint_id AS "checkpointId",observed_at AS "observedAt",received_at AS "receivedAt"
    FROM checkpoint_reports WHERE group_id=$1 ORDER BY observed_at,id`, [group.id])).rows;
  const names = new Map((group.route?.checkpoints || []).map(cp => [cp.id, cp.name]));
  const people = new Map(members.map(member => [member.id, member.name]));
  return { success: true, group, members, scans: scans.map(scan => ({ ...scan, memberName: people.get(scan.memberId), checkpointName: names.get(scan.checkpointId) || "Checkpoint" })) };
}
module.exports = { getGroupHistory, getGroupHistoryDetails };
