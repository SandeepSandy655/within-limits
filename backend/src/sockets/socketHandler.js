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
const pendingOperations = new Set();
function track(operation) {
  const pending = operation();
  pendingOperations.add(pending);
  void pending.then(() => pendingOperations.delete(pending), () => pendingOperations.delete(pending));
}
const { verifyMobileToken, ownsDevice } = require("../middleware/mobileAuth");

async function notifyPeers(io, deviceId, event, payload) {
  const peers = await connectionService.getConnectedDeviceIds(deviceId);
  for (const peerId of peers) {
    const id = getDeviceSocket(peerId);
    if (id) io.to(id).emit(event, payload);
  }
}

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
  const peers = await deviceService.getConnectedDevices(deviceId);

  for (const peer of peers) {
    const coordinates = peer?.location?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length !== 2) continue;

    socket.emit("device-location", {
      deviceId: peer.deviceId,
      longitude: coordinates[0],
      latitude: coordinates[1],
      accuracy: peer.accuracy,
      timestamp: peer.locationUpdatedAt,
      speed: null,
      heading: null,
      rangeState: peer.rangeState,
      rangeMeters: peer.rangeMeters,
      distanceMeters: peer.distanceMeters,
    });
  }
}

async function handleDeviceOnline(io, socket, data = {}) {
  data = data && typeof data === "object" ? data : {};
  const deviceId = typeof data.deviceId === "string" ? data.deviceId.trim() : "";
  if (!deviceId || deviceId !== socket.data.authorizedDeviceId) {
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
      io.sockets.sockets.get(previousSocketId)?.emit("device-replaced");
      io.sockets.sockets.get(previousSocketId)?.disconnect(true);
    }

    console.log(`[socket] Device online: ${deviceId}`);
    await notifyPeers(io, deviceId, "device-status", { deviceId, status: "online" });
    socket.emit("device-ready", { deviceId });
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
    const updated = await deviceService.updateDeviceLocation(deviceId, latitude, longitude, accuracy);
    await deviceService.saveLocationHistory(deviceId, latitude, longitude, accuracy, speed, heading);

    const peers = await deviceService.getConnectedDevices(deviceId);
    const payload = {
      deviceId,
      latitude,
      longitude,
      accuracy: Number.isFinite(accuracy) ? accuracy : null,
      speed: Number.isFinite(speed) ? speed : null,
      heading: Number.isFinite(heading) ? heading : null,
      timestamp: updated.locationUpdatedAt,
    };

    for (const peer of peers) {
      const peerSocketId = getDeviceSocket(peer.deviceId);
      const range = { rangeState: peer.rangeState, rangeMeters: peer.rangeMeters, distanceMeters: peer.distanceMeters };
      if (peer.location) {
        if (peerSocketId) io.to(peerSocketId).emit("device-location", { ...payload, ...range });
        // Moving the host back in range must also restore members on the host's map.
        socket.emit("device-location", { deviceId: peer.deviceId, longitude: peer.location.coordinates[0],
          latitude: peer.location.coordinates[1], accuracy: peer.accuracy, timestamp: peer.locationUpdatedAt,
          speed: null, heading: null, ...range });
      } else {
        if (peerSocketId) io.to(peerSocketId).emit("device-location-unavailable", { deviceId, ...range });
        socket.emit("device-location-unavailable", { deviceId: peer.deviceId, ...range });
      }
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
    const connection = await action(data.connectionId, socket.deviceId, data.rangeMeters);

    if (decision === "accepted") notifyConnectionAccepted(connection);
    else notifyConnectionRejected(connection);

    socket.emit(`connection-${decision}`, { connection });
    console.log(`[connection] ${decision}: ${connection.requesterId} <-> ${connection.receiverId}`);
  } catch (error) {
    socket.emit("connection-error", { message: error.message });
  }
}

function socketHandler(io) {
  io.use(async (socket, next) => {
    try {
      const user = await verifyMobileToken(socket.handshake.auth?.token);
      const deviceId = socket.handshake.auth?.deviceId;
      if (!await ownsDevice(user.uid, deviceId)) throw new Error("Register this device with your account before connecting.");
      socket.data.authorizedDeviceId = deviceId;
      socket.data.tokenExpiresAt = user.expiresAt;
      next();
    } catch (error) { next(new Error(error.message)); }
  });
  io.on("connection", (socket) => {
    const expiry = setTimeout(() => socket.disconnect(true), Math.max(1, socket.data.tokenExpiresAt - Date.now()));
    expiry.unref?.();
    console.log(`[socket] Connected: ${socket.id}`);

    socket.on("device-online", (data) => track(() => handleDeviceOnline(io, socket, data)));
    socket.on("device-location", (data) => track(() => handleDeviceLocation(io, socket, data)));

    registerWebRtcHandlers(io, socket);

    socket.on("disconnect", (reason) => track(async () => {
      clearTimeout(expiry);
      const deviceId = socket.deviceId;
      if (!deviceId || getDeviceSocket(deviceId) !== socket.id) return;

      removeDeviceSocket(deviceId, socket.id);
      lastLocationUpdateByDevice.delete(deviceId);
      try {
        await deviceService.updateDeviceStatus(deviceId, "offline");
        await notifyPeers(io, deviceId, "device-status", { deviceId, status: "offline" });
        console.log(`[socket] Device offline: ${deviceId} (${reason})`);
      } catch (error) {
        console.error(`[socket:disconnect] ${error.message}`);
      }
    }));
  });
}

socketHandler.drain = async () => {
  while (pendingOperations.size) await Promise.allSettled([...pendingOperations]);
};
module.exports = socketHandler;
