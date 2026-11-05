const { withTransaction } = require("../config/database");
const { assessConnectionRange } = require("./mobileRange");
const { insertNotification, publishNotification } = require("./notificationService");
const { emitToDevice } = require("../sockets/connectedDevices");

async function updateRangeAlerts(deviceId) {
  const events = await withTransaction(async (client) => {
    const links = await client.query(`SELECT c.id, c.receiver_id AS "hostId", c.requester_id AS "memberId", clock_timestamp() AS "assessedAt",
      c.range_meters AS "rangeMeters", c.out_of_range_since AS "outOfRangeSince", m.device_name AS "memberName",
      jsonb_build_object('location', h.location, 'locationUpdatedAt', h.location_updated_at,
        'accuracy', h.location_accuracy, 'sharingEnabled', h.sharing_enabled, 'status', h.status) AS host,
      jsonb_build_object('location', m.location, 'locationUpdatedAt', m.location_updated_at,
        'accuracy', m.location_accuracy, 'sharingEnabled', m.sharing_enabled, 'status', m.status) AS member
      FROM connections c JOIN devices h ON h.device_id = c.receiver_id JOIN devices m ON m.device_id = c.requester_id
      WHERE c.status = 'accepted' AND (c.requester_id = $1 OR c.receiver_id = $1)
      ORDER BY c.id FOR UPDATE OF c`, [deviceId]);
    const events = [];
    for (const link of links.rows) {
      const range = assessConnectionRange(link.host, link.member, link.rangeMeters, link.assessedAt.getTime());
      if (range.rangeState === "unavailable") continue;
      const outOfRange = range.rangeState === "out-of-range";
      if (outOfRange === !!link.outOfRangeSince) continue;
      const updated = await client.query(`UPDATE connections
        SET out_of_range_since = CASE WHEN $2 THEN clock_timestamp() ELSE NULL END
        WHERE id = $1 RETURNING out_of_range_since::text AS "eventTime"`, [link.id, outOfRange]);
      const notification = outOfRange ? await insertNotification(client, {
        deviceId: link.hostId, relatedDeviceId: link.memberId, connectionId: link.id, kind: "out-of-range",
        title: `${link.memberName} is out of reach`,
        body: `${link.memberName} is outside the ${link.rangeMeters / 1000} km range. Please contact them. Their location is hidden from the map until they are back in range.`,
        eventKey: `${link.id}:out-of-range:${updated.rows[0].eventTime}`,
      }) : null;
      events.push({ notification, hostId: link.hostId, memberId: link.memberId,
        connectionId: link.id, outOfRange, ...range });
    }
    return events;
  });
  for (const { notification, ...event } of events) {
    publishNotification(notification);
    emitToDevice(event.hostId, "connection-range-changed", event);
    emitToDevice(event.memberId, "connection-range-changed", event);
  }
}

module.exports = { updateRangeAlerts };
