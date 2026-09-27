const deviceService = require("../services/deviceService");

async function registerDevice(req, res) {
  try {
    const device = await deviceService.registerDevice(
      req.body
    );

    res.status(201).json({
      success: true,
      message: "Device registered successfully",
      device
    });

  } catch (error) {
    console.error(
      "Register device error:",
      error
    );

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}


async function getDevice(req, res) {
  try {
    const { deviceId } = req.params;

    const device =
      await deviceService.getDevice(deviceId);

    if (!device) {
      return res.status(404).json({
        success: false,
        message: "Device not found"
      });
    }

    res.status(200).json({
      success: true,
      device
    });

  } catch (error) {
    console.error(
      "Get device error:",
      error
    );

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}


async function getAllDevices(req, res) {
  try {
    const devices =
      await deviceService.getAllDevices();

    res.status(200).json({
      success: true,
      count: devices.length,
      devices
    });

  } catch (error) {
    console.error(
      "Get devices error:",
      error
    );

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}


async function getNearbyDevices(req, res) {
  try {
    const latitude =
      Number(req.query.latitude);

    const longitude =
      Number(req.query.longitude);

    const radius =
      Number(req.query.radius) || 5000;

    const currentDeviceId =
      req.query.deviceId || null;

    if (
      Number.isNaN(latitude) ||
      Number.isNaN(longitude)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid latitude and longitude are required",
      });
    }

    const devices =
      await deviceService.getNearbyDevices(
        latitude,
        longitude,
        radius,
        currentDeviceId
      );

    res.status(200).json({
      success: true,
      count: devices.length,
      radius,
      devices,
    });
  } catch (error) {
    console.error(
      "Get nearby devices error:",
      error
    );

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}


module.exports = {
  registerDevice,
  getDevice,
  getAllDevices,
  getNearbyDevices
};