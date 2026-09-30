const deviceService = require("../services/deviceService");

function sendError(res, error, status = 500) {
  console.error(`[devices] ${error.message}`);
  return res.status(status).json({
    success: false,
    message: status >= 500 ? "Device request failed" : error.message,
  });
}

async function registerDevice(req, res) {
  try {
    const device = await deviceService.registerDevice(req.body);
    return res.status(201).json({
      success: true,
      message: "Device registered successfully",
      device,
    });
  } catch (error) {
    return sendError(res, error, error.code === 11000 ? 409 : 400);
  }
}

async function getDevice(req, res) {
  try {
    const device = await deviceService.getDevice(req.params.deviceId);
    if (!device) {
      return res.status(404).json({ success: false, message: "Device not found" });
    }
    return res.json({ success: true, device });
  } catch (error) {
    return sendError(res, error);
  }
}

async function getAllDevices(_req, res) {
  try {
    const devices = await deviceService.getAllDevices();
    return res.json({ success: true, count: devices.length, devices });
  } catch (error) {
    return sendError(res, error);
  }
}

async function getNearbyDevices(req, res) {
  const { latitude, longitude, radius, deviceId } = req.query;
  const parsedLatitude = Number(latitude);
  const parsedLongitude = Number(longitude);
  const parsedRadius = radius === undefined ? undefined : Number(radius);

  if (!Number.isFinite(parsedLatitude) || !Number.isFinite(parsedLongitude)) {
    return res.status(400).json({
      success: false,
      message: "Valid latitude and longitude are required",
    });
  }
  if (parsedLatitude < -90 || parsedLatitude > 90 || parsedLongitude < -180 || parsedLongitude > 180) {
    return res.status(400).json({ success: false, message: "Coordinates are out of range" });
  }
  if (parsedRadius !== undefined && !Number.isFinite(parsedRadius)) {
    return res.status(400).json({ success: false, message: "radius must be a number" });
  }
  if (parsedRadius !== undefined && parsedRadius <= 0) {
    return res.status(400).json({ success: false, message: "radius must be positive" });
  }
  if (!deviceId) {
    return res.status(400).json({ success: false, message: "deviceId is required" });
  }

  try {
    const devices = await deviceService.getNearbyDevices(
      parsedLatitude,
      parsedLongitude,
      parsedRadius,
      deviceId
    );
    return res.json({
      success: true,
      count: devices.length,
      radius: parsedRadius ?? 5_000,
      devices,
    });
  } catch (error) {
    return sendError(res, error);
  }
}

async function getConnectedDevices(req, res) {
  try {
    const devices = await deviceService.getConnectedDevices(req.params.deviceId);
    return res.json({ success: true, devices });
  } catch (error) {
    return sendError(res, error);
  }
}

module.exports = {
  registerDevice,
  getDevice,
  getAllDevices,
  getNearbyDevices,
  getConnectedDevices,
};
