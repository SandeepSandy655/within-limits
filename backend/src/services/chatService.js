const { withTransaction } = require("../config/database");
const { emitToDevice } = require("../sockets/connectedDevices");

const PAGE_SIZE = 50;
const MESSAGE_SELECT = `id::text, host_device_id AS "hostId", sender_device_id AS "senderId",
  sender_name AS "senderName", client_message_id AS "clientMessageId", body, created_at AS "createdAt"`;
const fail = (status, message) => Object.assign(new Error(message), { status });

// Lock current memberships for the duration of each operation. Disconnects cannot
// race a send or history read, and pending invitations never grant chat access.
async function currentGroup(client, deviceId) {
  const result = await client.query(`SELECT c.id, c.requester_id, c.receiver_id,
      COALESCE(c.accepted_at, c.created_at)::text AS joined_at
    FROM connections c
    WHERE c.status = 'accepted' AND c.receiver_id = COALESCE(
      (SELECT receiver_id FROM connections WHERE requester_id = $1 AND status = 'accepted' LIMIT 1), $1)
    ORDER BY c.id FOR SHARE OF c`, [deviceId]);
  const links = result.rows;
  if (!links.length) return null;
  const hostId = links[0].receiver_id;
  const membership = links.find((link) => link.requester_id === deviceId);
  if (deviceId !== hostId && !membership) return null;
  // A new/rejoined member sees messages from their current approval onward.
  // A host starting a fresh group cannot expose a previous group's conversation.
  const joinedAt = membership?.joined_at || links.reduce((oldest, link) =>
    new Date(link.joined_at) < new Date(oldest) ? link.joined_at : oldest, links[0].joined_at);
  const ids = [hostId, ...links.map((link) => link.requester_id)];
  const members = await client.query(`SELECT device_id AS "deviceId", device_name AS "deviceName"
    FROM devices WHERE device_id = ANY($1::text[]) ORDER BY device_name, device_id`, [ids]);
  return { hostId, joinedAt, membershipKey: `${hostId}:${deviceId}:${joinedAt}`,
    members: members.rows.map((member) => ({ ...member, isHost: member.deviceId === hostId })) };
}

function requireGroup(group, membershipKey) {
  if (!group) throw fail(403, "Join an approved group to use chat.");
  if (membershipKey !== undefined && membershipKey !== group.membershipKey) {
    throw fail(409, "Your group changed. Refresh chat before sending again.");
  }
  return group;
}

function cursor(value, required = false) {
  if (value === undefined && !required) return null;
  if (typeof value !== "string" || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) {
    throw fail(400, "Invalid message cursor.");
  }
  return value;
}

async function unreadCount(client, deviceId, group) {
  const result = await client.query(`SELECT COUNT(*)::int AS count FROM mobile_chat_messages
    WHERE host_device_id = $1 AND created_at >= $2::timestamptz AND sender_device_id <> $3
      AND id > COALESCE((SELECT last_message_id FROM mobile_chat_reads
        WHERE device_id = $3 AND host_device_id = $1), 0)`, [group.hostId, group.joinedAt, deviceId]);
  return result.rows[0].count;
}

async function getChatSummary(deviceId) {
  return withTransaction(async (client) => {
    const group = await currentGroup(client, deviceId);
    return { group, unreadCount: group ? await unreadCount(client, deviceId, group) : 0 };
  });
}

async function getMessages(deviceId, options = {}) {
  const before = cursor(options.before), after = cursor(options.after);
  if (before && after) throw fail(400, "Use either before or after, not both.");
  return withTransaction(async (client) => {
    const group = requireGroup(await currentGroup(client, deviceId));
    const result = await client.query(`SELECT ${MESSAGE_SELECT} FROM mobile_chat_messages
      WHERE host_device_id = $1 AND created_at >= $2::timestamptz
        ${before ? "AND id < $3" : after ? "AND id > $3" : ""}
      ORDER BY mobile_chat_messages.id ${after ? "ASC" : "DESC"} LIMIT ${PAGE_SIZE + 1}`,
    [group.hostId, group.joinedAt, ...((before || after) ? [before || after] : [])]);
    const messages = result.rows.slice(0, PAGE_SIZE);
    if (!after) messages.reverse();
    return { group, messages, hasMore: result.rows.length > PAGE_SIZE,
      unreadCount: await unreadCount(client, deviceId, group) };
  });
}

async function sendMessage(deviceId, input = {}) {
  const { clientMessageId, membershipKey } = input;
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (!body || [...body].length > 2000 || body.includes("\0")) throw fail(400, "Write a message between 1 and 2,000 characters.");
  if (typeof clientMessageId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientMessageId)) {
    throw fail(400, "A valid client message ID is required.");
  }
  if (typeof membershipKey !== "string") throw fail(400, "Refresh your group before sending a message.");
  const saved = await withTransaction(async (client) => {
    const group = requireGroup(await currentGroup(client, deviceId), membershipKey);
    // Serialize group sends so committed IDs are ordered for cursor pagination.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 1))", [`mobile-chat:${group.hostId}`]);
    const existing = await client.query(`SELECT ${MESSAGE_SELECT} FROM mobile_chat_messages
      WHERE sender_device_id = $1 AND client_message_id = $2`, [deviceId, clientMessageId]);
    if (existing.rowCount) {
      const message = existing.rows[0];
      if (message.hostId !== group.hostId || message.body !== body || new Date(message.createdAt) < new Date(group.joinedAt)) {
        throw fail(409, "This message ID was already used. Refresh chat and send a new message.");
      }
      return { message, group, created: false };
    }
    const rate = await client.query(`SELECT COUNT(*)::int AS count FROM mobile_chat_messages
      WHERE sender_device_id = $1 AND created_at > clock_timestamp() - INTERVAL '1 minute'`, [deviceId]);
    if (rate.rows[0].count >= 60) throw fail(429, "You are sending messages too quickly. Try again in a minute.");
    const sender = group.members.find((member) => member.deviceId === deviceId);
    const inserted = await client.query(`INSERT INTO mobile_chat_messages
      (host_device_id, sender_device_id, sender_name, client_message_id, body) VALUES ($1,$2,$3,$4,$5)
      RETURNING ${MESSAGE_SELECT}`, [group.hostId, deviceId, sender.deviceName, clientMessageId, body]);
    return { message: inserted.rows[0], group, created: true };
  });
  if (saved.created) {
    for (const member of saved.group.members) emitToDevice(member.deviceId, "chat-message", { hostId: saved.group.hostId, message: saved.message });
  }
  return { message: saved.message, created: saved.created };
}

async function markChatRead(deviceId, messageId, membershipKey) {
  cursor(messageId, true);
  if (typeof membershipKey !== "string") throw fail(400, "Refresh your group before marking messages read.");
  return withTransaction(async (client) => {
    const group = requireGroup(await currentGroup(client, deviceId), membershipKey);
    const message = await client.query(`SELECT 1 FROM mobile_chat_messages
      WHERE id = $1 AND host_device_id = $2 AND created_at >= $3::timestamptz`, [messageId, group.hostId, group.joinedAt]);
    if (!message.rowCount) throw fail(404, "Message not found in your current group.");
    await client.query(`INSERT INTO mobile_chat_reads (device_id, host_device_id, last_message_id) VALUES ($1,$2,$3)
      ON CONFLICT (device_id, host_device_id) DO UPDATE
      SET last_message_id = GREATEST(mobile_chat_reads.last_message_id, EXCLUDED.last_message_id)`, [deviceId, group.hostId, messageId]);
  });
}

module.exports = { getChatSummary, getMessages, sendMessage, markChatRead };
