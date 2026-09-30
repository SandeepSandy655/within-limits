const deviceService = require("../services/deviceService");
const connectionService = require("../services/connectionService");
const {
  getDeviceSocket,
  setDeviceSocket,
  removeDeviceSocket,
  notifyConnectionRequest,
  notifyConnectionAccepted,
  notifyConnectionRejected,
} = require("./connectedDevices");
const registerWebRtcHandlers = require("./webrtcHandler");
const lastLocationUpdateByDevice = new Map();
const MIN_LOCATION_UPDATE_INTERVAL_MS = 5_000;

function emitDeviceError(socket, code, message) {
  socket.emit("device-error", { code, message });
}

function isValidCoordinate(latitude, longitude) {
  return (
    Number.isFinite(latitude) &&
    latitude >= -90 && latitude <= 90 &&
    Number.isFinite(longitude) &&
    longitude >= -180 && longitude <= 180
  );
}

async function sendLatestPeerLocations(socket, deviceId) {
  const peerIds = await connectionService.getConnectedDeviceIds(deviceId);
  const peers = await Promise.all(peerIds.map((peerId) => deviceService.getDevice(peerId)));

  for (const peer of peers) {
    const coordinates = peer?.location?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length !== 2) continue;

    socket.emit("device-location", {
      deviceId: peer.deviceId,
      longitude: coordinates[0],
      latitude: coordinates[1],
      accuracy: null,
      speed: null,
      heading: null,
    });
  }
}

async function handleDeviceOnline(io, socket, data = {}) {
  data = data && typeof data === "object" ? data : {};
  const deviceId = typeof data.deviceId === "string" ? data.deviceId.trim() : "";
  if (!deviceId) {
    emitDeviceError(socket, "DEVICE_ID_REQUIRED", "deviceId is required.");
    return;
  }

  try {
    const device = await deviceService.getDevice(deviceId);
    if (!device) {
      emitDeviceError(
        socket,
        "DEVICE_NOT_REGISTERED",
        "Register this device with the same backend before opening its socket. Check that the app's HTTP and Socket.IO URLs match."
      );
      console.warn(`[socket:device-online] Unregistered device rejected (${deviceId}).`);
      return;
    }

    socket.deviceId = deviceId;
    await deviceService.updateDeviceStatus(deviceId, "online");
    if (!socket.connected) {
      await deviceService.updateDeviceStatus(deviceId, "offline");
      return;
    }

    const previousSocketId = getDeviceSocket(deviceId);
    setDeviceSocket(deviceId, socket.id);

    if (previousSocketId && previousSocketId !== socket.id) {
      io.sockets.sockets.get(previousSocketId)?.disconnect(true);
    }

    console.log(`[socket] Device online: ${deviceId}`);
    io.emit("device-status", { deviceId, status: "online" });
    await sendLatestPeerLocations(socket, deviceId);
  } catch (error) {
    console.error(`[socket:device-online] ${error.message}`);
    emitDeviceError(socket, "DEVICE_ONLINE_FAILED", "Unable to register this device as online.");
  }
}

async function handleDeviceLocation(io, socket, data = {}) {
  data = data && typeof data === "object" ? data : {};
  const { deviceId, latitude, longitude, accuracy, speed, heading } = data;
  if (!socket.deviceId || deviceId !== socket.deviceId) {
    emitDeviceError(socket, "DEVICE_ID_MISMATCH", "Location sender does not match the registered socket device.");
    return;
  }

  if (!isValidCoordinate(latitude, longitude)) {
    emitDeviceError(socket, "INVALID_LOCATION", "Latitude or longitude is outside the valid range.");
    return;
  }

  const now = Date.now();
  const previousUpdate = lastLocationUpdateByDevice.get(deviceId) || 0;
  if (now - previousUpdate < MIN_LOCATION_UPDATE_INTERVAL_MS) return;
  lastLocationUpdateByDevice.set(deviceId, now);

  try {
    await deviceService.updateDeviceLocation(deviceId, latitude, longitude);
    await deviceService.saveLocationHistory(deviceId, latitude, longitude, accuracy, speed, heading);

    const peers = await connectionService.getConnectedDeviceIds(deviceId);
    const payload = {
      deviceId,
      latitude,
      longitude,
      accuracy: Number.isFinite(accuracy) ? accuracy : null,
      speed: Number.isFinite(speed) ? speed : null,
      heading: Number.isFinite(heading) ? heading : null,
    };

    for (const peerId of peers) {
      const peerSocketId = getDeviceSocket(peerId);
      if (peerSocketId) io.to(peerSocketId).emit("device-location", payload);
    }
  } catch (error) {
    console.error(`[socket:device-location] ${error.message}`);
    emitDeviceError(socket, "LOCATION_UPDATE_FAILED", "Unable to save the location update.");
  }
}

async function handleConnectionRequest(socket, data = {}) {
  data = data && typeof data === "object" ? data : {};
  const { requesterId, receiverId } = data;
  if (!socket.deviceId || requesterId !== socket.deviceId) {
    socket.emit("connection-error", { message: "Requesting device does not match this socket." });
    return;
  }

  try {
    const connection = await connectionService.sendConnectionRequest(requesterId, receiverId);
    notifyConnectionRequest(connection);
    socket.emit("connection-request-sent", { connection });
    console.log(`[connection] Request sent: ${requesterId} -> ${receiverId}`);
  } catch (error) {
    socket.emit("connection-error", { message: error.message });
  }
}

async function handleConnectionDecision(socket, data = {}, decision) {
  data = data && typeof data === "object" ? data : {};
  if (!socket.deviceId) {
    socket.emit("connection-error", { message: "Register this device before responding to a request." });
    return;
  }

  try {
    const action = decision === "accepted"
      ? connectionService.acceptConnection
      : connectionService.rejectConnection;
    const connection = await action(data.connectionId, socket.deviceId);

    if (decision === "accepted") notifyConnectionAccepted(connection);
    else notifyConnectionRejected(connection);

    socket.emit(`connection-${decision}`, { connection });
    console.log(`[connection] ${decision}: ${connection.requesterId} <-> ${connection.receiverId}`);
  } catch (error) {
    socket.emit("connection-error", { message: error.message });
  }
}

function socketHandler(io) {
  io.on("connection", (socket) => {
    console.log(`[socket] Connected: ${socket.id}`);

    socket.on("device-online", (data) => handleDeviceOnline(io, socket, data));
    socket.on("device-location", (data) => handleDeviceLocation(io, socket, data));
    socket.on("send-connection-request", (data) => handleConnectionRequest(socket, data));
    socket.on("accept-connection", (data) => handleConnectionDecision(socket, data, "accepted"));
    socket.on("reject-connection", (data) => handleConnectionDecision(socket, data, "rejected"));

    registerWebRtcHandlers(io, socket);

    socket.on("disconnect", async (reason) => {
      const deviceId = socket.deviceId;
      if (!deviceId || getDeviceSocket(deviceId) !== socket.id) return;

      removeDeviceSocket(deviceId, socket.id);
      lastLocationUpdateByDevice.delete(deviceId);
      try {
        await deviceService.updateDeviceStatus(deviceId, "offline");
        io.emit("device-status", { deviceId, status: "offline" });
        console.log(`[socket] Device offline: ${deviceId} (${reason})`);
      } catch (error) {
        console.error(`[socket:disconnect] ${error.message}`);
      }
    });
  });
}

module.exports = socketHandler;
