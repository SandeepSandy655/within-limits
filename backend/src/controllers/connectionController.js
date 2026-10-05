const connectionService = require("../services/connectionService");
const deviceService = require("../services/deviceService");
const {
  notifyConnectionRequest,
  notifyConnectionAccepted,
  notifyConnectionRejected,
  notifyConnectionDisconnected,
  notifyDeviceRing,
} = require("../sockets/connectedDevices");

// =====================================================
// REQUEST USING DEVICE ID
// =====================================================

async function sendConnectionRequest(
  req,
  res
) {
  try {
    const {
      requesterId,
      receiverId,
    } = req.body;

    const connection =
      await connectionService.sendConnectionRequest(
        requesterId,
        receiverId
      );

    notifyConnectionRequest(connection);

    res.status(201).json({
      success: true,
      message:
        "Connection request sent",
      connection,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

// =====================================================
// REQUEST USING CONNECTION CODE
// =====================================================

async function sendConnectionRequestByCode(
  req,
  res
) {
  try {
    const {
      requesterId,
      connectionCode,
    } = req.body;

    const connection =
      await connectionService.sendConnectionRequestByCode(
        requesterId,
        connectionCode
      );

    notifyConnectionRequest(connection);

    res.status(201).json({
      success: true,
      message:
        "Connection request sent",
      connection,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

// =====================================================
// ACCEPT
// =====================================================

async function acceptConnection(
  req,
  res
) {
  try {
    const {
      connectionId,
      deviceId,
    } = req.body;

    const connection =
      await connectionService.acceptConnection(
        connectionId,
        deviceId
      );

    notifyConnectionAccepted(connection);

    res.status(200).json({
      success: true,
      message:
        "Connection request accepted",
      connection,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

// =====================================================
// REJECT
// =====================================================

async function rejectConnection(
  req,
  res
) {
  try {
    const {
      connectionId,
      deviceId,
    } = req.body;

    const connection =
      await connectionService.rejectConnection(
        connectionId,
        deviceId
      );

    notifyConnectionRejected(connection);

    res.status(200).json({
      success: true,
      message:
        "Connection request rejected",
      connection,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

async function disconnectDevice(req, res) {
  try {
    const { connectionId, deviceId } = req.body;
    const connection = await connectionService.disconnectDevice(connectionId, deviceId);
    notifyConnectionDisconnected(connection);
    return res.json({ success: true, message: "Device disconnected", connectionId: String(connection._id) });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

async function ringDevice(req, res) {
  try {
    const { deviceId, targetDeviceId } = req.body;
    if (!await connectionService.areDevicesPaired(deviceId, targetDeviceId)) {
      return res.status(403).json({ success: false, message: "Only connected devices can send a buzzer." });
    }
    const [sender, target] = await Promise.all([
      deviceService.getDevice(deviceId),
      deviceService.getDevice(targetDeviceId),
    ]);
    if (!sender || !target) {
      return res.status(404).json({ success: false, message: "Device not found." });
    }
    const delivered = notifyDeviceRing(targetDeviceId, {
      fromDeviceId: sender.deviceId,
      fromDeviceName: sender.deviceName,
    });
    if (!delivered) {
      return res.status(409).json({ success: false, message: "That device is offline. The buzzer requires its app to be connected." });
    }
    return res.json({ success: true, message: "Buzzer sent." });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

// =====================================================
// GET CONNECTIONS
// =====================================================

async function getDeviceConnections(
  req,
  res
) {
  try {
    const {
      deviceId,
    } = req.params;

    const connections =
      await connectionService.getDeviceConnections(
        deviceId
      );

    res.json({
      success: true,
      count: connections.length,
      connections,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

// =====================================================
// GET PENDING
// =====================================================

async function getPendingRequests(
  req,
  res
) {
  try {
    const {
      deviceId,
    } = req.params;

    const requests =
      await connectionService.getPendingRequests(
        deviceId
      );

    res.json({
      success: true,
      count: requests.length,
      requests,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

module.exports = {
  sendConnectionRequest,
  sendConnectionRequestByCode,
  acceptConnection,
  rejectConnection,
  disconnectDevice,
  ringDevice,
  getDeviceConnections,
  getPendingRequests,
};
