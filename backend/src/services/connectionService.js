const Connection = require("../models/Connection");
const Device = require("../models/Device");

function requireDeviceId(deviceId, fieldName = "deviceId") {
  if (typeof deviceId !== "string" || !deviceId.trim()) {
    throw new Error(`${fieldName} is required`);
  }
  return deviceId.trim();
}

async function sendConnectionRequest(requesterId, receiverId) {
  const requester = requireDeviceId(requesterId, "requesterId");
  const receiver = requireDeviceId(receiverId, "receiverId");
  if (requester === receiver) throw new Error("A device cannot connect to itself");

  const [requesterDevice, receiverDevice] = await Promise.all([
    Device.exists({ deviceId: requester }),
    Device.exists({ deviceId: receiver }),
  ]);
  if (!requesterDevice) throw new Error(`Requester device ${requester} is not registered`);
  if (!receiverDevice) throw new Error(`Receiver device ${receiver} is not registered`);

  const existing = await Connection.findOne({
    $or: [
      { requesterId: requester, receiverId: receiver },
      { requesterId: receiver, receiverId: requester },
    ],
  });

  if (existing) {
    if (existing.status === "accepted") throw new Error("Devices are already connected");
    if (existing.status === "pending") throw new Error("Connection request already exists");
    if (existing.status === "blocked") throw new Error("This connection is blocked");

    existing.requesterId = requester;
    existing.receiverId = receiver;
    existing.status = "pending";
    existing.createdAt = new Date();
    existing.acceptedAt = null;
    return existing.save();
  }

  return Connection.create({
    requesterId: requester,
    receiverId: receiver,
    status: "pending",
  });
}

async function sendConnectionRequestByCode(requesterId, connectionCode) {
  const requester = requireDeviceId(requesterId, "requesterId");
  const code = String(connectionCode ?? "").replace(/\D/g, "");
  if (code.length !== 8) throw new Error("Connection code must be 8 digits");

  const receiver = await Device.findOne({ connectionCode: code }).select("deviceId").lean();
  if (!receiver) throw new Error("No device found with this connection code");
  return sendConnectionRequest(requester, receiver.deviceId);
}

async function decideConnection(connectionId, deviceId, status) {
  if (!connectionId) throw new Error("connectionId is required");
  const actor = requireDeviceId(deviceId);
  const connection = await Connection.findById(connectionId);
  if (!connection) throw new Error("Connection request not found");
  if (connection.receiverId !== actor) {
    throw new Error("Only the receiving device can respond to this request");
  }
  if (connection.status !== "pending") {
    throw new Error(`Connection request is already ${connection.status}`);
  }

  connection.status = status;
  if (status === "accepted") connection.acceptedAt = new Date();
  return connection.save();
}

function acceptConnection(connectionId, deviceId) {
  return decideConnection(connectionId, deviceId, "accepted");
}

function rejectConnection(connectionId, deviceId) {
  return decideConnection(connectionId, deviceId, "rejected");
}

async function disconnectDevice(connectionId, deviceId) {
  if (!connectionId) throw new Error("connectionId is required");
  const actor = requireDeviceId(deviceId);
  const connection = await Connection.findById(connectionId);
  if (!connection || connection.status !== "accepted") {
    throw new Error("Active connection not found");
  }
  if (connection.requesterId !== actor && connection.receiverId !== actor) {
    throw new Error("This device is not part of the connection");
  }
  const disconnected = connection.toObject();
  await connection.deleteOne();
  return disconnected;
}

async function getDeviceConnections(deviceId) {
  const id = requireDeviceId(deviceId);
  return Connection.find({
    $or: [{ requesterId: id }, { receiverId: id }],
  }).sort({ createdAt: -1 }).lean();
}

async function getPendingRequests(deviceId) {
  const id = requireDeviceId(deviceId);
  return Connection.find({ receiverId: id, status: "pending" })
    .sort({ createdAt: -1 })
    .lean();
}

async function areDevicesPaired(firstDeviceId, secondDeviceId) {
  if (!firstDeviceId || !secondDeviceId) return false;
  return Boolean(await Connection.exists({
    status: "accepted",
    $or: [
      { requesterId: firstDeviceId, receiverId: secondDeviceId },
      { requesterId: secondDeviceId, receiverId: firstDeviceId },
    ],
  }));
}

async function getConnectedDeviceIds(deviceId) {
  const id = requireDeviceId(deviceId);
  const connections = await Connection.find({
    status: "accepted",
    $or: [{ requesterId: id }, { receiverId: id }],
  }).select("requesterId receiverId").lean();

  return connections.map((connection) =>
    connection.requesterId === id ? connection.receiverId : connection.requesterId
  );
}

module.exports = {
  sendConnectionRequest,
  sendConnectionRequestByCode,
  acceptConnection,
  rejectConnection,
  disconnectDevice,
  getDeviceConnections,
  getPendingRequests,
  areDevicesPaired,
  getConnectedDeviceIds,
};
