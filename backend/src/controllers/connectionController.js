const connectionService = require("../services/connectionService");
const {
  notifyConnectionRequest,
  notifyConnectionAccepted,
  notifyConnectionRejected,
  notifyConnectionDisconnected,
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
  getDeviceConnections,
  getPendingRequests,
};
