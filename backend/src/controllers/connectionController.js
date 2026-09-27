const connectionService = require("../services/connectionService");
const {
  notifyConnectionRequest,
  notifyConnectionAccepted,
  notifyConnectionRejected
} = require("../sockets/connectedDevices");

async function sendConnectionRequest(req, res) {
  try {
    const { requesterId, receiverId } = req.body;

    const connection =
      await connectionService.sendConnectionRequest(
        requesterId,
        receiverId
      );

    notifyConnectionRequest(connection);

    res.status(201).json({
      success: true,
      message: "Connection request sent",
      connection
    });
  } catch (error) {
    console.error("Send connection request error:", error);

    res.status(400).json({
      success: false,
      message: error.message
    });
  }
}

async function sendConnectionRequestByCode(req, res) {
  try {
    const { requesterId, connectionCode } = req.body;

    const connection =
      await connectionService.sendConnectionRequestByCode(
        requesterId,
        connectionCode
      );

    notifyConnectionRequest(connection);

    res.status(201).json({
      success: true,
      message: "Connection request sent",
      connection
    });
  } catch (error) {
    console.error(
      "Send connection request by code error:",
      error
    );

    res.status(400).json({
      success: false,
      message: error.message
    });
  }
}

async function acceptConnection(req, res) {
  try {
    const { connectionId } = req.body;

    const connection =
      await connectionService.acceptConnection(connectionId);

    notifyConnectionAccepted(connection);

    res.status(200).json({
      success: true,
      message: "Connection request accepted",
      connection
    });
  } catch (error) {
    console.error("Accept connection error:", error);

    res.status(400).json({
      success: false,
      message: error.message
    });
  }
}

async function rejectConnection(req, res) {
  try {
    const { connectionId } = req.body;

    const connection =
      await connectionService.rejectConnection(connectionId);

    notifyConnectionRejected(connection);

    res.status(200).json({
      success: true,
      message: "Connection request rejected",
      connection
    });
  } catch (error) {
    console.error("Reject connection error:", error);

    res.status(400).json({
      success: false,
      message: error.message
    });
  }
}

async function getDeviceConnections(req, res) {
  try {
    const { deviceId } = req.params;

    const connections =
      await connectionService.getDeviceConnections(deviceId);

    res.status(200).json({
      success: true,
      count: connections.length,
      connections
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
}

async function getPendingRequests(req, res) {
  try {
    const { deviceId } = req.params;

    const requests =
      await connectionService.getPendingRequests(deviceId);

    res.status(200).json({
      success: true,
      count: requests.length,
      requests
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
}

module.exports = {
  sendConnectionRequest,
  sendConnectionRequestByCode,
  acceptConnection,
  rejectConnection,
  getDeviceConnections,
  getPendingRequests
};
