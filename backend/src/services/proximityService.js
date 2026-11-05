const { createHash } = require("node:crypto");
const { pool, withTransaction } = require("../config/database");
const { InputError, reportInput, id, text } = require("./trackingValidation");

const { STALE_AFTER_MS, ALERT_AFTER_MS, nextOutOfRangeSince, proximityAlert } = require("./proximityTiming");
const hashToken = (value) => createHash("sha256").update(value).digest("hex");

function proximityInput(body, now = Date.now()) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new InputError("Send a proximity observation.");
  const allowed = new Set(["eventId", "tagId", "observedAt", "state", "rssi", "buzzerEnabled"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) throw new InputError("Unexpected proximity report field.");
  const report = reportInput(body, now);
  if (!/^WL-[0-9A-F]{12}$/.test(report.tagId)) throw new InputError("Invalid BLE tag ID.");
  if (!["waiting", "near", "far", "lost"].includes(body.state)) throw new InputError("Invalid proximity state.");
  if (typeof body.buzzerEnabled !== "boolean") throw new InputError("buzzerEnabled must be true or false.");
  const rssi = body.rssi;
  if (rssi !== null && (!Number.isInteger(rssi) || rssi < -127 || rssi > 20)) throw new InputError("RSSI must be an integer from -127 to 20, or null.");
  if (["near", "far"].includes(body.state) && rssi === null) throw new InputError("A near/far observation needs an RSSI measurement.");
  if (["waiting", "lost"].includes(body.state) && rssi !== null) throw new InputError("Waiting/lost reports must not contain an old RSSI value.");
  return { ...report, state: body.state, rssi, buzzerEnabled: body.buzzerEnabled };
}

async function receiveProximity(token, body) {
  if (typeof token !== "string" || token.length < 32 || token.length > 300) throw new InputError("Invalid proximity credential.", 401);
  return withTransaction(async (client) => {
    const monitor = (await client.query("SELECT * FROM proximity_monitors WHERE token_hash=$1 AND revoked_at IS NULL FOR UPDATE", [hashToken(token)])).rows[0];
    if (!monitor) throw new InputError("Invalid proximity credential.", 401);
    const report = proximityInput(body);
    if (monitor.reports_cleared_at && new Date(report.observedAt) <= new Date(monitor.reports_cleared_at)) {
      throw new InputError("This report predates the data reset. Send a new observation.", 422);
    }
    const previous = (await client.query("SELECT tag_id,state,rssi,buzzer_enabled,observed_at FROM proximity_reports WHERE monitor_id=$1 AND event_id=$2", [monitor.id, report.eventId])).rows[0];
    if (previous) {
      if (previous.tag_id !== report.tagId || previous.state !== report.state || previous.rssi !== report.rssi || previous.buzzer_enabled !== report.buzzerEnabled || new Date(previous.observed_at).toISOString() !== report.observedAt) throw new InputError("eventId has already been used for different content.", 409);
      return { success: true, duplicate: true };
    }
    if (new Date(report.observedAt) < new Date(monitor.created_at)) throw new InputError("Observation predates monitor setup.", 422);
    if (monitor.tag_id && monitor.tag_id !== report.tagId) throw new InputError("This credential belongs to a different BLE board.", 422);
    if (!monitor.tag_id) await client.query("UPDATE proximity_monitors SET tag_id=$2 WHERE id=$1", [monitor.id, report.tagId]);
    const latest = (await client.query("SELECT state,observed_at,received_at FROM proximity_reports WHERE monitor_id=$1 ORDER BY observed_at DESC,id DESC LIMIT 1", [monitor.id])).rows[0];
    const outsideSince = nextOutOfRangeSince(monitor, latest, report);
    await client.query(`INSERT INTO proximity_reports (monitor_id,event_id,tag_id,state,rssi,buzzer_enabled,observed_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`, [monitor.id, report.eventId, report.tagId, report.state, report.rssi, report.buzzerEnabled, report.observedAt]);
    await client.query("UPDATE proximity_monitors SET out_of_range_since=$2 WHERE id=$1", [monitor.id, outsideSince]);
    return { success: true, duplicate: false };
  });
}

async function getProximityOverview(routeIds, now = Date.now()) {
  const result = await pool.query(`SELECT m.id,m.route_id AS "routeId",m.name,m.tag_id AS "tagId",m.revoked_at AS "revokedAt",
    m.member_id AS "memberId",a.group_id AS "groupId",m.assigned_at AS "assignedAt",m.out_of_range_since AS "outOfRangeSince",
    COALESCE(a.id IS NOT NULL AND r.observed_at>=m.assigned_at AND r.received_at>=m.assigned_at,FALSE) AS "assignmentFresh",
    r.state,r.rssi,r.buzzer_enabled AS "buzzerEnabled",r.observed_at AS "observedAt",r.received_at AS "receivedAt"
    FROM proximity_monitors m LEFT JOIN tracking_members a ON a.id=m.member_id AND a.active LEFT JOIN LATERAL (
      SELECT * FROM proximity_reports WHERE monitor_id=m.id ORDER BY observed_at DESC,id DESC LIMIT 1
    ) r ON TRUE WHERE m.route_id=ANY($1::uuid[]) ORDER BY m.created_at,m.id`, [routeIds]);
  return result.rows.map((row) => {
    const online = !row.revokedAt && Boolean(row.observedAt) && now - new Date(row.observedAt).getTime() <= STALE_AFTER_MS && now - new Date(row.receivedAt).getTime() <= STALE_AFTER_MS;
    return { ...row, online, status: row.revokedAt ? "revoked" : !row.observedAt ? "unseen" : online ? row.state : "offline",
      alarm: online && row.buzzerEnabled && ["far", "lost"].includes(row.state),
      proximityAlert: proximityAlert({ ...row, online }, now), alertAfterSeconds: ALERT_AFTER_MS / 1000 };
  });
}

async function assignProximity(monitorId, memberId, admin) {
  monitorId = text(monitorId, "Monitor ID");
  memberId = memberId === null ? null : id(memberId, "Member ID");
  try {
    return await withTransaction(async (client) => {
      // Route lock matches trip completion's lock order, so assignments cannot race exit.
      const scope = (await client.query(`SELECT r.id FROM monitoring_routes r JOIN proximity_monitors m ON m.route_id=r.id
        WHERE m.id=$1 AND ($2='super_admin' OR r.owner_uid=$3) FOR UPDATE OF r`, [monitorId, admin.role, admin.uid])).rows[0];
      if (!scope) throw new InputError("BLE board not found.", 404);
      const monitor = (await client.query("SELECT * FROM proximity_monitors WHERE id=$1 FOR UPDATE", [monitorId])).rows[0];
      if (memberId) {
        if (monitor.revoked_at) throw new InputError("Enable this board before assigning it.", 409);
        const member = await client.query(`SELECT m.id FROM tracking_members m JOIN tracked_groups g ON g.id=m.group_id
          WHERE m.id=$1 AND m.active AND g.route_id=$2 FOR UPDATE OF m`, [memberId, scope.id]);
        if (!member.rowCount) throw new InputError("Choose an active member on this board's route.", 422);
      }
      if (monitor.member_id === memberId) return { success: true };
      await client.query("UPDATE proximity_monitors SET member_id=$2,assigned_at=CASE WHEN $2::uuid IS NULL THEN NULL ELSE NOW() END,out_of_range_since=NULL WHERE id=$1", [monitorId, memberId]);
      return { success: true };
    });
  } catch (error) {
    if (error.code === "23505") throw new InputError("This member already has a BLE board. Unlink it first.", 409);
    throw error;
  }
}

module.exports = { proximityInput, receiveProximity, getProximityOverview, assignProximity, hashToken, STALE_AFTER_MS };
