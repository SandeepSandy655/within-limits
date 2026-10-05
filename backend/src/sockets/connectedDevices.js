const connectedDevices = new Map();

let ioInstance = null;

function setIo(io) {
  ioInstance = io;
}

function setDeviceSocket(deviceId, socketId) {
  if (!deviceId || !socketId) {
    return;
  }

  connectedDevices.set(deviceId, socketId);
}

function removeDeviceSocket(deviceId, socketId) {
  if (!deviceId) {
    return;
  }

  if (connectedDevices.get(deviceId) === socketId) {
    connectedDevices.delete(deviceId);
  }
}

function getDeviceSocket(deviceId) {
  return connectedDevices.get(deviceId);
}

function emitToDevice(deviceId, event, data) {
  if (!ioInstance || !deviceId) {
    return false;
  }

  const socketId = connectedDevices.get(deviceId);

  if (!socketId) {
    return false;
  }

  ioInstance.to(socketId).emit(event, data);
  return true;
}

function notifyDeviceRing(deviceId, payload) {
  return emitToDevice(deviceId, "device-buzzer", payload);
}

function notifyConnectionRequest(connection) {
  emitToDevice(connection.receiverId, "connection-request", {
    connection
  });
}

function notifyConnectionAccepted(connection) {
  const payload = { connection };

  emitToDevice(connection.requesterId, "connection-accepted", payload);
  emitToDevice(connection.receiverId, "connection-accepted", payload);
}

function notifyConnectionRejected(connection) {
  const payload = { connection };

  emitToDevice(connection.requesterId, "connection-rejected", payload);
  emitToDevice(connection.receiverId, "connection-rejected", payload);
}

function notifyConnectionDisconnected(connection) {
  const payload = { connectionId: String(connection._id) };
  emitToDevice(connection.requesterId, "connection-disconnected", payload);
  emitToDevice(connection.receiverId, "connection-disconnected", payload);
}

module.exports = {
  setIo,
  setDeviceSocket,
  removeDeviceSocket,
  getDeviceSocket,
  emitToDevice,
  notifyDeviceRing,
  notifyConnectionRequest,
  notifyConnectionAccepted,
  notifyConnectionRejected,
  notifyConnectionDisconnected,
  connectedDevices
};
