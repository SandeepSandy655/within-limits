const { randomBytes } = require("node:crypto");
const { pool, withTransaction } = require("../config/database");

const MAX_LINKED_DEVICES_PER_HOST = 4;
const ACTIVE_STATUSES = ["pending", "accepted"];
const CONNECTION_SELECT = `
  id AS "_id",
  requester_id AS "requesterId",
  receiver_id AS "receiverId",
  status,
  created_at AS "createdAt",
  accepted_at AS "acceptedAt"
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

async function assertCanLink(client, requesterId, receiverId, excludeConnectionId) {
  const excludeSql = excludeConnectionId ? "AND id <> $4" : "";
  const params = [requesterId, receiverId, ACTIVE_STATUSES];
  if (excludeConnectionId) params.push(excludeConnectionId);

  const requesterHasLink = await client.query(
    `SELECT 1 FROM connections
     WHERE status = ANY($3::text[])
       AND (requester_id = $1 OR receiver_id = $1) ${excludeSql}
     LIMIT 1`,
    params
  );
  if (requesterHasLink.rowCount) {
    throw new Error("This device is already linked or has a pending connection. A linked device cannot connect to another device.");
  }

  const receiverIsLinked = await client.query(
    `SELECT 1 FROM connections
     WHERE requester_id = $2 AND status = ANY($3::text[]) ${excludeSql}
     LIMIT 1`,
    params
  );
  if (receiverIsLinked.rowCount) {
    throw new Error("This device is linked to another host and cannot host connections.");
  }

  const hostLinks = await client.query(
    `SELECT COUNT(*)::int AS count FROM connections
     WHERE receiver_id = $2 AND status = ANY($3::text[]) ${excludeSql}`,
    params
  );
  if (hostLinks.rows[0].count >= MAX_LINKED_DEVICES_PER_HOST) {
    throw new Error(`This host has reached its limit of ${MAX_LINKED_DEVICES_PER_HOST} linked devices.`);
  }
}

async function sendConnectionRequest(requesterId, receiverId) {
  const requester = requireDeviceId(requesterId, "requesterId");
  const receiver = requireDeviceId(receiverId, "receiverId");
  if (requester === receiver) throw new Error("A device cannot connect to itself");

  return withTransaction(async (client) => {
    await lockDevices(client, [requester, receiver]);
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
      if (existing.status === "accepted") throw new Error("Devices are already connected");
      if (existing.status === "pending") throw new Error("Connection request already exists");
      if (existing.status === "blocked") throw new Error("This connection is blocked");

      await assertCanLink(client, requester, receiver, existing._id);
      const updated = await client.query(
        `UPDATE connections SET requester_id = $2, receiver_id = $3,
                status = 'pending', created_at = NOW(), accepted_at = NULL
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
  const code = String(connectionCode ?? "").replace(/\D/g, "");
  if (code.length !== 8) throw new Error("Connection code must be 8 digits");

  const receiverResult = await pool.query(
    "SELECT device_id AS \"deviceId\" FROM devices WHERE connection_code = $1",
    [code]
  );
  const receiver = receiverResult.rows[0];
  if (!receiver) throw new Error("No device found with this connection code");
  return sendConnectionRequest(requester, receiver.deviceId);
}

async function decideConnection(connectionId, deviceId, status) {
  if (!connectionId) throw new Error("connectionId is required");
  const actor = requireDeviceId(deviceId);

  return withTransaction(async (client) => {
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
    if (connection.status !== "pending") throw new Error(`Connection request is already ${connection.status}`);

    if (status === "accepted") {
      await assertCanLink(client, connection.requesterId, connection.receiverId, connection._id);
    }

    const updated = await client.query(
      `UPDATE connections SET status = $2,
              accepted_at = CASE WHEN $2 = 'accepted' THEN NOW() ELSE accepted_at END
       WHERE id = $1 RETURNING ${CONNECTION_SELECT}`,
      [connection._id, status]
    );
    return updated.rows[0];
  });
}

function acceptConnection(connectionId, deviceId) {
  return decideConnection(connectionId, deviceId, "accepted");
}

function rejectConnection(connectionId, deviceId) {
  return decideConnection(connectionId, deviceId, "rejected");
}

async function disconnectDevice(connectionId, deviceId) {
  if (!connectionId) throw new Error("connectionId is required");
  const actor = requireDeviceId(deviceId);
  return withTransaction(async (client) => {
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
  return result.rows;
}

async function getPendingRequests(deviceId) {
  const id = requireDeviceId(deviceId);
  const result = await pool.query(
    `SELECT ${CONNECTION_SELECT} FROM connections
     WHERE receiver_id = $1 AND status = 'pending'
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

module.exports = {
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
