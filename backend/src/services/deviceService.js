const Device = require("../models/Device");
const Location = require("../models/Location");

function generateConnectionCode() {
  return String(
    Math.floor(10000000 + Math.random() * 90000000)
  );
}

async function generateUniqueConnectionCode() {
  let code;
  let exists = true;

  while (exists) {
    code = generateConnectionCode();

    exists = await Device.exists({
      connectionCode: code
    });
  }

  return code;
}

async function registerDevice(deviceData) {
  const {
    deviceId,
    ownerId,
    deviceName,
    platform,
    deviceType
  } = deviceData;

  if (!deviceId) {
    throw new Error("deviceId is required");
  }

  let device = await Device.findOne({ deviceId });

  // NEW DEVICE
  if (!device) {
    const connectionCode =
      await generateUniqueConnectionCode();

    device = await Device.create({
      deviceId,
      connectionCode,
      ownerId: ownerId || null,
      deviceName: deviceName || "Unknown Device",
      deviceType: deviceType || "mobile",
      platform: platform || "unknown",
      status: "offline"
    });

    return device;
  }

  // OLD DEVICE WITHOUT A CODE
  if (!device.connectionCode) {
    device.connectionCode =
      await generateUniqueConnectionCode();
  }

  device.ownerId = ownerId || device.ownerId;
  device.deviceName =
    deviceName || device.deviceName;
  device.deviceType =
    deviceType || device.deviceType;
  device.platform =
    platform || device.platform;

  await device.save();

  return device;
}

async function getDevice(deviceId) {
  return Device.findOne({ deviceId }).lean();
}

async function getAllDevices() {
  return Device.find()
    .sort({ createdAt: -1 })
    .lean();
}

async function getNearbyDevices(
  latitude,
  longitude,
  radius
) {
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number"
  ) {
    throw new Error(
      "Valid latitude and longitude are required"
    );
  }

  if (latitude < -90 || latitude > 90) {
    throw new Error("Invalid latitude");
  }

  if (longitude < -180 || longitude > 180) {
    throw new Error("Invalid longitude");
  }

  const searchRadius = radius || 5000;

  return Device.find({
    status: "online",
    location: {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [
            longitude,
            latitude
          ]
        },
        $maxDistance: searchRadius
      }
    }
  }).lean();
}

async function updateDeviceStatus(
  deviceId,
  status
) {
  const device =
    await Device.findOneAndUpdate(
      { deviceId },
      {
        status,
        lastSeen: new Date()
      },
      {
        returnDocument: "after"
      }
    );

  if (!device) {
    throw new Error(
      `Device ${deviceId} not found`
    );
  }

  return device;
}

async function updateDeviceLocation(
  deviceId,
  latitude,
  longitude,
  accuracy
) {
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number"
  ) {
    throw new Error(
      "Valid latitude and longitude are required"
    );
  }

  const device =
    await Device.findOneAndUpdate(
      { deviceId },
      {
        location: {
          type: "Point",
          coordinates: [
            longitude,
            latitude
          ]
        },
        lastSeen: new Date()
      },
      {
        returnDocument: "after"
      }
    );

  if (!device) {
    throw new Error(
      `Device ${deviceId} not found`
    );
  }

  return device;
}

async function saveLocationHistory(
  deviceId,
  latitude,
  longitude,
  accuracy,
  speed,
  heading
) {
  return Location.create({
    deviceId,
    location: {
      type: "Point",
      coordinates: [
        longitude,
        latitude
      ]
    },
    accuracy: accuracy ?? null,
    speed: speed ?? null,
    heading: heading ?? null,
    timestamp: new Date()
  });
}

module.exports = {
  registerDevice,
  getDevice,
  getAllDevices,
  getNearbyDevices,
  updateDeviceStatus,
  updateDeviceLocation,
  saveLocationHistory
};