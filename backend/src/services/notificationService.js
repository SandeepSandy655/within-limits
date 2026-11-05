const { randomBytes } = require("node:crypto");
const { pool, withTransaction } = require("../config/database");
const { emitToDevice } = require("../sockets/connectedDevices");

const NOTIFICATION_SELECT = `id, device_id AS "deviceId", kind, title, body,
  related_device_id AS "relatedDeviceId", connection_id AS "connectionId",
  created_at AS "createdAt", read_at AS "readAt"`;

async function insertNotification(client, notification) {
  const result = await client.query(`INSERT INTO mobile_notifications
    (id, device_id, kind, title, body, related_device_id, connection_id, event_key)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (event_key) DO NOTHING
    RETURNING ${NOTIFICATION_SELECT}`, [randomBytes(12).toString("hex"), notification.deviceId,
    notification.kind, notification.title, notification.body, notification.relatedDeviceId || null,
    notification.connectionId || null, notification.eventKey || null]);
  return result.rows[0] || null;
}

function publishNotification(notification) {
  if (notification) emitToDevice(notification.deviceId, "notification", { notification });
}

async function createNotification(notification) {
  const saved = await insertNotification(pool, notification);
  publishNotification(saved);
  return saved;
}

// Store connection activity in the same transaction, then deliver it after commit.
// The event key makes request/approval retries safe without duplicate inbox entries.
async function withConnectionActivity(kind, actorId, work) {
  const { connection, notification } = await withTransaction(async (client) => {
    const connection = await work(client);
    const host = connection.receiverName || "Your host";
    const member = connection.requesterName || "A member";
    const details = {
      "connection-request": { status: "pending", deviceId: connection.receiverId, relatedDeviceId: connection.requesterId,
        title: "New join request", body: `${member} wants to join your group. Choose their range in Requests.` },
      "connection-accepted": { status: "accepted", deviceId: connection.requesterId, relatedDeviceId: connection.receiverId,
        title: "You're connected", body: `${host} approved your request with a ${connection.rangeMeters / 1000} km range.` },
      "connection-rejected": { status: "rejected", deviceId: connection.requesterId, relatedDeviceId: connection.receiverId,
        title: "Join request declined", body: `${host} declined your join request.` },
      "connection-cancelled": { status: "rejected", deviceId: connection.receiverId, relatedDeviceId: connection.requesterId,
        title: "Join request cancelled", body: `${member} cancelled their join request. The space is available again.` },
      "connection-disconnected": { status: "accepted", deviceId: actorId === connection.receiverId ? connection.requesterId : connection.receiverId,
        relatedDeviceId: actorId, title: "Connection ended", body: actorId === connection.receiverId
          ? `${host} removed this connection. Location sharing with this host has stopped.`
          : `${member} left your group. Location sharing with this member has stopped.` },
    }[kind];
    const notification = details && connection.status === details.status
      ? await insertNotification(client, { ...details, kind, connectionId: connection._id,
        eventKey: `${connection._id}:${new Date(connection.createdAt).toISOString()}:${kind}` }) : null;
    return { connection, notification };
  });
  publishNotification(notification);
  return connection;
}

async function getNotifications(deviceId) {
  const [items, count] = await Promise.all([
    pool.query(`SELECT ${NOTIFICATION_SELECT} FROM mobile_notifications WHERE device_id = $1
      ORDER BY created_at DESC, id DESC LIMIT 100`, [deviceId]),
    pool.query("SELECT COUNT(*)::int AS count FROM mobile_notifications WHERE device_id = $1 AND read_at IS NULL", [deviceId]),
  ]);
  return { notifications: items.rows, unreadCount: count.rows[0].count };
}

async function markNotificationsRead(deviceId, ids) {
  if (!Array.isArray(ids) || ids.length > 100 || ids.some((id) => typeof id !== "string" || !id)) {
    throw new Error("Provide up to 100 notification IDs to mark as read.");
  }
  await pool.query(`UPDATE mobile_notifications SET read_at = NOW()
    WHERE device_id = $1 AND id = ANY($2::text[]) AND read_at IS NULL`, [deviceId, ids]);
}

module.exports = { insertNotification, publishNotification, createNotification, withConnectionActivity, getNotifications, markNotificationsRead };
