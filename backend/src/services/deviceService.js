const { randomBytes, randomInt } = require("node:crypto");
const { pool } = require("../config/database");
const { assessConnectionRange } = require("./mobileRange");
const { updateRangeAlerts } = require("./mobileRangeService");
const { getDeviceConnections, MAX_LINKED_DEVICES_PER_HOST } = require("./connectionService");

const DEFAULT_SEARCH_RADIUS_METERS = 2_000;

const DEVICE_SELECT = `
  id AS "_id",
  device_id AS "deviceId",
  connection_code AS "connectionCode",
  owner_id AS "ownerId",
  device_name AS "deviceName",
  device_type AS "deviceType",
  platform,
  status,
  location,
  last_seen AS "lastSeen",
  location_updated_at AS "locationUpdatedAt",
  location_accuracy AS "accuracy",
  sharing_enabled AS "sharingEnabled",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

function createConnectionCode() {
  return String(randomInt(10_000_000, 100_000_000));
}

function normalizeDeviceId(deviceId) {
  if (typeof deviceId !== "string" || !deviceId.trim()) {
    throw new Error("deviceId is required");
  }
  return deviceId.trim();
}

function validateCoordinates(latitude, longitude) {
  if (
    !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
    !Number.isFinite(longitude) || longitude < -180 || longitude > 180
  ) {
    throw new Error("Valid latitude and longitude are required");
  }
}

function distanceMeters(latitude1, longitude1, latitude2, longitude2) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const deltaLatitude = radians(latitude2 - latitude1);
  const deltaLongitude = radians(longitude2 - longitude1);
  const a = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(radians(latitude1)) * Math.cos(radians(latitude2))
    * Math.sin(deltaLongitude / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function coordinatesFromLocation(location) {
  const coordinates = location?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length !== 2) return null;
  const [longitude, latitude] = coordinates.map(Number);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

async function createUniqueConnectionCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = createConnectionCode();
    const result = await pool.query(
      "SELECT 1 FROM devices WHERE connection_code = $1 LIMIT 1",
      [code]
    );
    if (result.rowCount === 0) return code;
  }
  throw new Error("Could not generate a unique connection code. Please retry.");
}

async function registerDevice(deviceData) {
  if (!deviceData || typeof deviceData !== "object") {
    throw new Error("Device details are required");
  }

  const deviceId = normalizeDeviceId(deviceData.deviceId);
  const suppliedName = typeof deviceData.deviceName === "string"
    ? deviceData.deviceName.trim().slice(0, 32)
    : "";
  if (deviceData.deviceName !== undefined && !suppliedName) {
    throw new Error("deviceName must contain at least one visible character");
  }

  const existingResult = await pool.query(
    `SELECT ${DEVICE_SELECT} FROM devices WHERE device_id = $1`,
    [deviceId]
  );
  const existing = existingResult.rows[0];
  if (!deviceData.ownerId || (existing && existing.ownerId !== deviceData.ownerId)) {
    throw new Error("This installation belongs to another account or is a legacy device. Register a new device identity.");
  }
  const connectionCode = existing?.connectionCode || await createUniqueConnectionCode();
  const values = [
    existing?._id || randomBytes(12).toString("hex"),
    deviceId,
    connectionCode,
    deviceData.ownerId || existing?.ownerId || null,
    suppliedName || existing?.deviceName || "My device",
    deviceData.deviceType || existing?.deviceType || "mobile",
    deviceData.platform || existing?.platform || "unknown",
  ];

  try {
    const result = await pool.query(
      `INSERT INTO devices (id, device_id, connection_code, owner_id, device_name, device_type, platform, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'offline')
       ON CONFLICT (device_id) DO UPDATE SET
         connection_code = COALESCE(devices.connection_code, EXCLUDED.connection_code),
         owner_id = COALESCE(EXCLUDED.owner_id, devices.owner_id),
         device_name = EXCLUDED.device_name,
         device_type = EXCLUDED.device_type,
         platform = EXCLUDED.platform,
         updated_at = NOW()
       WHERE devices.owner_id = EXCLUDED.owner_id
       RETURNING ${DEVICE_SELECT}`,
      values
    );
    if (!result.rows[0]) throw new Error("This device belongs to another account.");
    return result.rows[0];
  } catch (error) {
    if (error.code === "23505" && !existing) {
      // A simultaneous registration may have won the device or code uniqueness race.
      const retry = await pool.query(
        `SELECT ${DEVICE_SELECT} FROM devices WHERE device_id = $1`,
        [deviceId]
      );
      if (retry.rows[0]?.ownerId === deviceData.ownerId) return retry.rows[0];
    }
    throw error;
  }
}

async function getDevice(deviceId) {
  const result = await pool.query(
    `SELECT ${DEVICE_SELECT} FROM devices WHERE device_id = $1`,
    [normalizeDeviceId(deviceId)]
  );
  return result.rows[0] || null;
}

async function hideUnavailableInvitation(device) {
  if (!device) return device;
  const active = (await getDeviceConnections(device.deviceId)).filter((link) => ["accepted", "pending"].includes(link.status));
  const canInvite = !active.some((link) => link.requesterId === device.deviceId)
    && active.length < MAX_LINKED_DEVICES_PER_HOST;
  return { ...device, connectionCode: canInvite ? device.connectionCode : null };
}

async function getAllDevices() {
  const result = await pool.query(
    `SELECT device_id AS "deviceId", device_name AS "deviceName",
            device_type AS "deviceType", platform, status,
            last_seen AS "lastSeen"
     FROM devices ORDER BY created_at DESC`
  );
  return result.rows;
}

async function getNearbyDevices(latitude, longitude, radius, deviceId) {
  validateCoordinates(latitude, longitude);
  const normalizedId = normalizeDeviceId(deviceId);
  const searchRadius = radius ?? DEFAULT_SEARCH_RADIUS_METERS;
  if (!Number.isFinite(searchRadius) || searchRadius <= 0) {
    throw new Error("radius must be a positive number");
  }

  const peers = await getConnectedDevices(normalizedId);
  return peers
    .map((device) => {
      const point = coordinatesFromLocation(device.location);
      if (!point) return null;
      return { ...device, distance: distanceMeters(latitude, longitude, point.latitude, point.longitude) };
    })
    .filter((device) => device && device.distance <= Math.min(searchRadius, device.rangeMeters))
    .sort((first, second) => first.distance - second.distance)
    .map(({ distance, ...device }) => device);
}

async function getConnectedDevices(deviceId) {
  const id = normalizeDeviceId(deviceId);
  const result = await pool.query(`SELECT d.device_id AS "deviceId", d.device_name AS "deviceName", d.status,
      d.location, d.last_seen AS "lastSeen", d.location_updated_at AS "locationUpdatedAt",
      d.location_accuracy AS accuracy, d.sharing_enabled AS "sharingEnabled",
      c.range_meters AS "rangeMeters", c.out_of_range_since AS "outOfRangeSince", clock_timestamp() AS "assessedAt",
      jsonb_build_object('location', self.location, 'locationUpdatedAt', self.location_updated_at,
        'accuracy', self.location_accuracy, 'sharingEnabled', self.sharing_enabled, 'status', self.status) AS self
      FROM connections c JOIN devices d ON d.device_id =
        CASE WHEN c.requester_id = $1 THEN c.receiver_id ELSE c.requester_id END
      JOIN devices self ON self.device_id = $1
      WHERE c.status = 'accepted' AND (c.requester_id = $1 OR c.receiver_id = $1)
      ORDER BY c.accepted_at`, [id]);
  return result.rows.map(({ self, assessedAt, ...peer }) => {
    const range = assessConnectionRange(self, peer, peer.rangeMeters, assessedAt.getTime());
    return { ...peer, ...range, location: range.rangeState === "within-range" ? peer.location : null };
  });
}

async function updateDeviceStatus(deviceId, status) {
  const normalizedId = normalizeDeviceId(deviceId);
  if (!["online", "offline"].includes(status)) {
    throw new Error("status must be online or offline");
  }

  const result = await pool.query(
    `UPDATE devices SET status = $2, last_seen = NOW(), updated_at = NOW()
     WHERE device_id = $1 RETURNING ${DEVICE_SELECT}`,
    [normalizedId, status]
  );
  if (!result.rows[0]) throw new Error(`Device ${normalizedId} is not registered`);
  await updateRangeAlerts(normalizedId);
  return result.rows[0];
}

async function updateDeviceLocation(deviceId, latitude, longitude, accuracy) {
  const normalizedId = normalizeDeviceId(deviceId);
  validateCoordinates(latitude, longitude);
  const location = { type: "Point", coordinates: [longitude, latitude] };

  const result = await pool.query(
    `UPDATE devices SET location = $2::jsonb, last_seen = NOW(), updated_at = NOW(), location_updated_at = NOW(), location_accuracy = $3
     WHERE device_id = $1 AND sharing_enabled = TRUE RETURNING ${DEVICE_SELECT}`,
    [normalizedId, JSON.stringify(location), Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null]
  );
  if (!result.rows[0]) throw new Error(`Device ${normalizedId} is not registered`);
  await updateRangeAlerts(normalizedId);
  return result.rows[0];
}

async function saveLocationHistory(deviceId, latitude, longitude, accuracy, speed, heading) {
  const normalizedId = normalizeDeviceId(deviceId);
  validateCoordinates(latitude, longitude);
  const location = { type: "Point", coordinates: [longitude, latitude] };
  const result = await pool.query(
    `INSERT INTO locations (id, device_id, location, accuracy, speed, heading)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6)
     RETURNING id AS "_id", device_id AS "deviceId", location, accuracy,
               speed, heading, timestamp`,
    [
      randomBytes(12).toString("hex"),
      normalizedId,
      JSON.stringify(location),
      Number.isFinite(accuracy) ? accuracy : null,
      Number.isFinite(speed) ? speed : null,
      Number.isFinite(heading) ? heading : null,
    ]
  );
  return result.rows[0];
}

async function setLocationSharing(deviceId, enabled) {
  if (typeof enabled !== "boolean") throw new Error("sharingEnabled must be true or false.");
  await pool.query(`UPDATE devices SET sharing_enabled = $2,
    location = CASE WHEN $2 THEN location ELSE NULL END,
    location_updated_at = CASE WHEN $2 THEN location_updated_at ELSE NULL END,
    location_accuracy = CASE WHEN $2 THEN location_accuracy ELSE NULL END WHERE device_id = $1`, [deviceId, enabled]);
}

module.exports = {
  registerDevice,
  getDevice,
  hideUnavailableInvitation,
  getAllDevices,
  getNearbyDevices,
  getConnectedDevices,
  updateDeviceStatus,
  updateDeviceLocation,
  saveLocationHistory,
  setLocationSharing,
};
