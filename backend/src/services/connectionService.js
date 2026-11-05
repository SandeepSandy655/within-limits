const { randomBytes } = require("node:crypto");
const { pool } = require("../config/database");
const { requireConnectionRange } = require("./mobileRange");
const { withConnectionActivity } = require("./notificationService");

const MAX_GROUP_DEVICES = 4;
const MAX_LINKED_DEVICES_PER_HOST = MAX_GROUP_DEVICES - 1;
const PENDING_TTL_MINUTES = 10;
const ACTIVE_STATUSES = ["pending", "accepted"];
const CONNECTION_SELECT = `
  id AS "_id",
  requester_id AS "requesterId",
  receiver_id AS "receiverId",
  status,
  created_at AS "createdAt",
  accepted_at AS "acceptedAt"
  , range_meters AS "rangeMeters", out_of_range_since AS "outOfRangeSince"
  , (SELECT device_name FROM devices WHERE device_id = connections.requester_id) AS "requesterName"
  , (SELECT device_name FROM devices WHERE device_id = connections.receiver_id) AS "receiverName"
  , created_at + INTERVAL '10 minutes' AS "expiresAt"
`;

function requireDeviceId(deviceId, fieldName = "deviceId") {
  if (typeof deviceId !== "string" || !deviceId.trim()) {
    throw new Error(`${fieldName} is required`);
  }
  return deviceId.trim();
}

async function lockDevices(client, deviceIds) {
  for (const deviceId of [...new Set(deviceIds)].sort()) {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [deviceId]);
  }
}

async function expirePending(client, deviceIds) {
  await client.query(`UPDATE connections SET status = 'rejected'
    WHERE status = 'pending' AND created_at <= NOW() - INTERVAL '10 minutes'
      AND (requester_id = ANY($1::text[]) OR receiver_id = ANY($1::text[]))`, [deviceIds]);
}

async function assertCanLink(client, requesterId, receiverId, excludeConnectionId) {
  const excludeSql = excludeConnectionId ? "AND id <> $3" : "";
  const requesterParams = [requesterId, ACTIVE_STATUSES];
  const receiverParams = [receiverId, ACTIVE_STATUSES];
  if (excludeConnectionId) {
    requesterParams.push(excludeConnectionId);
    receiverParams.push(excludeConnectionId);
  }

  const requesterHasLink = await client.query(
    `SELECT 1 FROM connections
     WHERE status = ANY($2::text[])
       AND (requester_id = $1 OR receiver_id = $1) ${excludeSql}
     LIMIT 1`,
    requesterParams
  );
  if (requesterHasLink.rowCount) {
    throw new Error("This device is already linked or has a pending connection. A linked device cannot connect to another device.");
  }

  const receiverIsLinked = await client.query(
    `SELECT 1 FROM connections
     WHERE requester_id = $1 AND status = ANY($2::text[]) ${excludeSql}
     LIMIT 1`,
    receiverParams
  );
  if (receiverIsLinked.rowCount) {
    throw new Error("This device is linked to another host and cannot host connections.");
  }

  const hostLinks = await client.query(
    `SELECT COUNT(*)::int AS count FROM connections
     WHERE receiver_id = $1 AND status = ANY($2::text[]) ${excludeSql}`,
    receiverParams
  );
  if (hostLinks.rows[0].count >= MAX_LINKED_DEVICES_PER_HOST) {
    throw new Error("This group is full: 4 devices total, including the host. Pending requests reserve a space.");
  }
}

async function sendConnectionRequest(requesterId, receiverId) {
  const requester = requireDeviceId(requesterId, "requesterId");
  const receiver = requireDeviceId(receiverId, "receiverId");
  if (requester === receiver) throw new Error("A device cannot connect to itself");

  return withConnectionActivity("connection-request", requester, async (client) => {
    await lockDevices(client, [requester, receiver]);
    await expirePending(client, [requester, receiver]);
    const deviceCheck = await client.query(
      "SELECT device_id FROM devices WHERE device_id = ANY($1::text[])",
      [[requester, receiver]]
    );
    const registeredIds = new Set(deviceCheck.rows.map(({ device_id }) => device_id));
    if (!registeredIds.has(requester)) throw new Error(`Requester device ${requester} is not registered`);
    if (!registeredIds.has(receiver)) throw new Error(`Receiver device ${receiver} is not registered`);

    const existingResult = await client.query(
      `SELECT ${CONNECTION_SELECT} FROM connections
       WHERE (requester_id = $1 AND receiver_id = $2)
          OR (requester_id = $2 AND receiver_id = $1)
       LIMIT 1 FOR UPDATE`,
      [requester, receiver]
    );
    const existing = existingResult.rows[0];

    if (existing) {
      if (["accepted", "pending"].includes(existing.status) && existing.requesterId === requester) return existing;
      if (["accepted", "pending"].includes(existing.status)) throw new Error("A connection already exists between these devices.");
      if (existing.status === "blocked") throw new Error("This connection is blocked");

      await assertCanLink(client, requester, receiver, existing._id);
      const updated = await client.query(
        `UPDATE connections SET requester_id = $2, receiver_id = $3,
                status = 'pending', created_at = NOW(), accepted_at = NULL,
                range_meters = 1000, out_of_range_since = NULL
         WHERE id = $1 RETURNING ${CONNECTION_SELECT}`,
        [existing._id, requester, receiver]
      );
      return updated.rows[0];
    }

    await assertCanLink(client, requester, receiver);
    const inserted = await client.query(
      `INSERT INTO connections (id, requester_id, receiver_id, status)
       VALUES ($1, $2, $3, 'pending') RETURNING ${CONNECTION_SELECT}`,
      [randomBytes(12).toString("hex"), requester, receiver]
    );
    return inserted.rows[0];
  });
}

async function sendConnectionRequestByCode(requesterId, connectionCode) {
  const requester = requireDeviceId(requesterId, "requesterId");
  const code = normalizeCode(connectionCode);

  const receiverResult = await pool.query(
    "SELECT device_id AS \"deviceId\" FROM devices WHERE connection_code = $1",
    [code]
  );
  const receiver = receiverResult.rows[0];
  if (!receiver) throw new Error("No device found with this connection code");
  return sendConnectionRequest(requester, receiver.deviceId);
}

async function decideConnection(connectionId, deviceId, status, rangeMeters) {
  if (!connectionId) throw new Error("connectionId is required");
  const actor = requireDeviceId(deviceId);

  return withConnectionActivity(`connection-${status}`, actor, async (client) => {
    const initial = await client.query(
      `SELECT requester_id AS "requesterId", receiver_id AS "receiverId"
       FROM connections WHERE id = $1`,
      [String(connectionId)]
    );
    const participants = initial.rows[0];
    if (!participants) throw new Error("Connection request not found");
    await lockDevices(client, [participants.requesterId, participants.receiverId]);

    const result = await client.query(
      `SELECT ${CONNECTION_SELECT} FROM connections WHERE id = $1 FOR UPDATE`,
      [String(connectionId)]
    );
    const connection = result.rows[0];
    if (!connection) throw new Error("Connection request not found");
    if (connection.receiverId !== actor) throw new Error("Only the receiving device can respond to this request");
    if (connection.status === status) return connection;
    if (connection.status !== "pending") throw new Error(`Connection request is already ${connection.status}`);
    if (new Date(connection.expiresAt).getTime() <= Date.now()) throw new Error("This request expired. Ask the member to join again.");

    if (status === "accepted") {
      requireConnectionRange(rangeMeters);
      await expirePending(client, [connection.requesterId, connection.receiverId]);
      await assertCanLink(client, connection.requesterId, connection.receiverId, connection._id);
    }

    const updated = await client.query(
      `UPDATE connections SET status = $2,
              accepted_at = CASE WHEN $2 = 'accepted' THEN NOW() ELSE accepted_at END,
              range_meters = CASE WHEN $2 = 'accepted' THEN $3 ELSE range_meters END
       WHERE id = $1 RETURNING ${CONNECTION_SELECT}`,
      [connection._id, status, status === "accepted" ? rangeMeters : null]
    );
    return updated.rows[0];
  });
}

function acceptConnection(connectionId, deviceId, rangeMeters) {
  return decideConnection(connectionId, deviceId, "accepted", rangeMeters);
}

function rejectConnection(connectionId, deviceId) {
  return decideConnection(connectionId, deviceId, "rejected");
}

async function disconnectDevice(connectionId, deviceId) {
  if (!connectionId) throw new Error("connectionId is required");
  const actor = requireDeviceId(deviceId);
  return withConnectionActivity("connection-disconnected", actor, async (client) => {
    const selected = await client.query(
      `SELECT ${CONNECTION_SELECT} FROM connections
       WHERE id = $1 AND status = 'accepted' FOR UPDATE`,
      [String(connectionId)]
    );
    const connection = selected.rows[0];
    if (!connection) throw new Error("Active connection not found");
    if (connection.requesterId !== actor && connection.receiverId !== actor) {
      throw new Error("This device is not part of the connection");
    }
    await client.query("DELETE FROM connections WHERE id = $1", [String(connectionId)]);
    return connection;
  });
}

async function getDeviceConnections(deviceId) {
  const id = requireDeviceId(deviceId);
  const result = await pool.query(
    `SELECT ${CONNECTION_SELECT} FROM connections
     WHERE requester_id = $1 OR receiver_id = $1
     ORDER BY created_at DESC`,
    [id]
  );
  return result.rows.filter((row) => row.status !== "pending" || new Date(row.expiresAt).getTime() > Date.now());
}

async function getPendingRequests(deviceId) {
  const id = requireDeviceId(deviceId);
  const result = await pool.query(
    `SELECT ${CONNECTION_SELECT} FROM connections
     WHERE receiver_id = $1 AND status = 'pending' AND created_at > NOW() - INTERVAL '10 minutes'
     ORDER BY created_at DESC`,
    [id]
  );
  return result.rows;
}

async function areDevicesPaired(firstDeviceId, secondDeviceId) {
  if (!firstDeviceId || !secondDeviceId) return false;
  const result = await pool.query(
    `SELECT 1 FROM connections
     WHERE status = 'accepted'
       AND ((requester_id = $1 AND receiver_id = $2)
         OR (requester_id = $2 AND receiver_id = $1))
     LIMIT 1`,
    [firstDeviceId, secondDeviceId]
  );
  return result.rowCount > 0;
}

async function getConnectedDeviceIds(deviceId) {
  const id = requireDeviceId(deviceId);
  const result = await pool.query(
    `SELECT requester_id AS "requesterId", receiver_id AS "receiverId"
     FROM connections WHERE status = 'accepted'
       AND (requester_id = $1 OR receiver_id = $1)`,
    [id]
  );
  return result.rows.map((connection) =>
    connection.requesterId === id ? connection.receiverId : connection.requesterId
  );
}

function normalizeCode(value) {
  const code = typeof value === "string" ? value.replace(/[\s-]/g, "") : "";
  if (!/^\d{8}$/.test(code)) throw new Error("Connection code must be 8 digits.");
  return code;
}

async function previewHost(connectionCode, requesterId) {
  const result = await pool.query(`SELECT device_id AS "deviceId", device_name AS "deviceName", status
    FROM devices WHERE connection_code = $1 AND owner_id IS NOT NULL`, [normalizeCode(connectionCode)]);
  const host = result.rows[0];
  if (!host) throw new Error("No host found. Check the code and try again.");
  if (host.deviceId === requesterId) throw new Error("That is your code. Use the host's code to join their group.");
  const links = await getDeviceConnections(host.deviceId);
  const active = links.filter((link) => ACTIVE_STATUSES.includes(link.status));
  if (active.some((link) => link.requesterId === host.deviceId)) throw new Error("This device is a member of another group and cannot host.");
  return { ...host, occupied: active.length + 1, available: Math.max(0, MAX_LINKED_DEVICES_PER_HOST - active.length), maxDevices: MAX_GROUP_DEVICES };
}

async function cancelConnection(connectionId, deviceId) {
  return withConnectionActivity("connection-cancelled", deviceId, async (client) => {
    const selected = await client.query(`SELECT ${CONNECTION_SELECT} FROM connections WHERE id = $1 FOR UPDATE`, [connectionId]);
    const connection = selected.rows[0];
    if (!connection || connection.requesterId !== deviceId) throw new Error("Join request not found.");
    if (connection.status === "rejected") return connection;
    if (connection.status !== "pending") throw new Error("The host already responded. Open your group to leave.");
    await client.query("UPDATE connections SET status = 'rejected' WHERE id = $1", [connectionId]);
    return { ...connection, status: "rejected" };
  });
}

module.exports = {
  MAX_GROUP_DEVICES,
  PENDING_TTL_MINUTES,
  normalizeCode,
  previewHost,
  cancelConnection,
  MAX_LINKED_DEVICES_PER_HOST,
  sendConnectionRequest,
  sendConnectionRequestByCode,
  acceptConnection,
  rejectConnection,
  disconnectDevice,
  getDeviceConnections,
  getPendingRequests,
  areDevicesPaired,
  getConnectedDeviceIds,
};
