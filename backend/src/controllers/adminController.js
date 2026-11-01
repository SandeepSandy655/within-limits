const { pool } = require("../config/database");
const { notifyDeviceRing } = require("../sockets/connectedDevices");

function toPublicDevice(device) {
  if (!device) return null;
  return {
    deviceId: device.deviceId,
    deviceName: device.deviceName,
    deviceType: device.deviceType,
    platform: device.platform,
    status: device.status,
    lastSeen: device.lastSeen,
  };
}

async function getOverview(_req, res) {
  try {
    const connectionsResult = await pool.query(
      `SELECT id AS "_id", requester_id AS "requesterId",
              receiver_id AS "receiverId", accepted_at AS "acceptedAt"
       FROM connections WHERE status = 'accepted'`
    );
    const connections = connectionsResult.rows;
    const deviceIds = [...new Set(connections.flatMap(({ requesterId, receiverId }) => [requesterId, receiverId]))];
    const devicesResult = await pool.query(
      `SELECT device_id AS "deviceId", device_name AS "deviceName",
              device_type AS "deviceType", platform, status,
              last_seen AS "lastSeen"
       FROM devices WHERE device_id = ANY($1::text[])`,
      [deviceIds]
    );
    const deviceById = new Map(devicesResult.rows.map((device) => [device.deviceId, device]));
    const groupsByHost = new Map();

    for (const connection of connections) {
      const host = deviceById.get(connection.receiverId);
      const linked = deviceById.get(connection.requesterId);
      if (!host || !linked) continue;
      if (!groupsByHost.has(host.deviceId)) {
        groupsByHost.set(host.deviceId, { host: toPublicDevice(host), members: [] });
      }
      groupsByHost.get(host.deviceId).members.push({
        ...toPublicDevice(linked),
        acceptedAt: connection.acceptedAt || null,
      });
    }

    const groups = [...groupsByHost.values()];
    const allDevices = groups.flatMap(({ host, members }) => [host, ...members]);
    const uniqueDevices = [...new Map(allDevices.map((device) => [device.deviceId, device])).values()];

    return res.json({
      success: true,
      generatedAt: new Date().toISOString(),
      source: "current mobile app records",
      groups,
      summary: {
        groups: groups.length,
        devices: uniqueDevices.length,
        online: uniqueDevices.filter((device) => device.status === "online").length,
        hardwareReports: null,
      },
    });
  } catch (error) {
    console.error(`[admin] Overview failed: ${error.message}`);
    return res.status(500).json({ success: false, message: "Could not load the admin overview." });
  }
}

async function ringGroupDevice(req, res) {
  const { hostId } = req.params;
  const { targetDeviceId } = req.body || {};
  if (typeof targetDeviceId !== "string" || !targetDeviceId.trim()) {
    return res.status(400).json({ success: false, message: "targetDeviceId is required." });
  }

  try {
    const targetResult = await pool.query(
      `SELECT device_id AS "deviceId", device_name AS "deviceName"
       FROM devices WHERE device_id = $1`,
      [targetDeviceId]
    );
    const target = targetResult.rows[0];
    if (!target) return res.status(404).json({ success: false, message: "Device not found." });

    const isHost = targetDeviceId === hostId;
    const isLinkedMember = await pool.query(
      `SELECT 1 FROM connections
       WHERE status = 'accepted' AND receiver_id = $1 AND requester_id = $2
       LIMIT 1`,
      [hostId, targetDeviceId]
    );
    if (!isHost && !isLinkedMember.rowCount) {
      return res.status(404).json({ success: false, message: "Device is not part of this group." });
    }

    const sent = notifyDeviceRing(targetDeviceId, {
      fromDeviceId: "admin-console",
      fromDeviceName: "Group admin",
    });
    if (!sent) {
      return res.status(409).json({ success: false, message: "That app is offline; the buzzer could not be delivered." });
    }
    return res.json({ success: true, message: `Buzzer sent to ${target.deviceName || target.deviceId}.` });
  } catch (error) {
    console.error(`[admin] Buzzer failed: ${error.message}`);
    return res.status(500).json({ success: false, message: "Could not send the buzzer." });
  }
}

module.exports = { getOverview, ringGroupDevice };
