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
    return;
  }

  const socketId = connectedDevices.get(deviceId);

  if (!socketId) {
    return;
  }

  ioInstance.to(socketId).emit(event, data);
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

module.exports = {
  setIo,
  setDeviceSocket,
  removeDeviceSocket,
  getDeviceSocket,
  emitToDevice,
  notifyConnectionRequest,
  notifyConnectionAccepted,
  notifyConnectionRejected,
  connectedDevices
};
