const { randomInt } = require("node:crypto");

const Connection = require("../models/Connection");
const Device = require("../models/Device");
const Location = require("../models/Location");

const DEFAULT_SEARCH_RADIUS_METERS = 5_000;

function createConnectionCode() {
  return String(randomInt(10_000_000, 100_000_000));
}

async function createUniqueConnectionCode() {
  while (true) {
    const code = createConnectionCode();
    const exists = await Device.exists({ connectionCode: code });
    if (!exists) return code;
  }
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
  let device = await Device.findOne({ deviceId });

  if (!device) {
    const connectionCode = await createUniqueConnectionCode();
    try {
      return await Device.create({
        deviceId,
        connectionCode,
        ownerId: deviceData.ownerId || null,
        deviceName: suppliedName || "My device",
        deviceType: deviceData.deviceType || "mobile",
        platform: deviceData.platform || "unknown",
        status: "offline",
      });
    } catch (error) {
      // If two startup requests race for the same ID, return the device
      // created by the request that won the unique-index insert.
      if (error.code !== 11000) throw error;
      device = await Device.findOne({ deviceId });
      if (!device) throw error;
    }
  }

  if (!device.connectionCode) {
    device.connectionCode = await createUniqueConnectionCode();
  }
  device.ownerId = deviceData.ownerId || device.ownerId;
  device.deviceName = suppliedName || device.deviceName;
  device.deviceType = deviceData.deviceType || device.deviceType;
  device.platform = deviceData.platform || device.platform;

  await device.save();
  return device;
}

async function getDevice(deviceId) {
  return Device.findOne({ deviceId: normalizeDeviceId(deviceId) }).lean();
}

async function getAllDevices() {
  return Device.find()
    .sort({ createdAt: -1 })
    .select("deviceId deviceName deviceType platform status lastSeen")
    .lean();
}

async function getPeerIds(deviceId) {
  const normalizedId = normalizeDeviceId(deviceId);
  const connections = await Connection.find({
    status: "accepted",
    $or: [
      { requesterId: normalizedId },
      { receiverId: normalizedId },
    ],
  }).select("requesterId receiverId").lean();

  return connections.map((connection) =>
    connection.requesterId === normalizedId
      ? connection.receiverId
      : connection.requesterId
  );
}

async function getNearbyDevices(latitude, longitude, radius, deviceId) {
  validateCoordinates(latitude, longitude);
  const normalizedId = normalizeDeviceId(deviceId);
  const searchRadius = radius ?? DEFAULT_SEARCH_RADIUS_METERS;
  if (!Number.isFinite(searchRadius) || searchRadius <= 0) {
    throw new Error("radius must be a positive number");
  }

  const peerIds = await getPeerIds(normalizedId);
  if (peerIds.length === 0) return [];

  return Device.find({
    deviceId: { $in: peerIds },
    status: "online",
    location: {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [longitude, latitude],
        },
        $maxDistance: searchRadius,
      },
    },
  })
    .select("deviceId deviceName status location lastSeen")
    .lean();
}

async function getConnectedDevices(deviceId) {
  const peerIds = await getPeerIds(deviceId);
  if (peerIds.length === 0) return [];

  return Device.find({ deviceId: { $in: peerIds } })
    .select("deviceId deviceName status location lastSeen")
    .lean();
}

async function updateDeviceStatus(deviceId, status) {
  const normalizedId = normalizeDeviceId(deviceId);
  if (!["online", "offline"].includes(status)) {
    throw new Error("status must be online or offline");
  }

  const device = await Device.findOneAndUpdate(
    { deviceId: normalizedId },
    { $set: { status, lastSeen: new Date() } },
    { returnDocument: "after", runValidators: true }
  );

  if (!device) throw new Error(`Device ${normalizedId} is not registered`);
  return device;
}

async function updateDeviceLocation(deviceId, latitude, longitude) {
  const normalizedId = normalizeDeviceId(deviceId);
  validateCoordinates(latitude, longitude);

  const device = await Device.findOneAndUpdate(
    { deviceId: normalizedId },
    {
      $set: {
        location: {
          type: "Point",
          coordinates: [longitude, latitude],
        },
        lastSeen: new Date(),
      },
    },
    { returnDocument: "after", runValidators: true }
  );

  if (!device) throw new Error(`Device ${normalizedId} is not registered`);
  return device;
}

async function saveLocationHistory(deviceId, latitude, longitude, accuracy, speed, heading) {
  normalizeDeviceId(deviceId);
  validateCoordinates(latitude, longitude);

  return Location.create({
    deviceId,
    location: {
      type: "Point",
      coordinates: [longitude, latitude],
    },
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
    speed: Number.isFinite(speed) ? speed : null,
    heading: Number.isFinite(heading) ? heading : null,
    timestamp: new Date(),
  });
}

module.exports = {
  registerDevice,
  getDevice,
  getAllDevices,
  getNearbyDevices,
  getConnectedDevices,
  updateDeviceStatus,
  updateDeviceLocation,
  saveLocationHistory,
};
