const Connection = require("../models/Connection");
const Device = require("../models/Device");

function normalizeConnectionCode(connectionCode) {
  return String(connectionCode || "").replace(/\D/g, "");
}

async function enrichConnection(connection, currentDeviceId) {
  const plain = connection.toObject
    ? connection.toObject()
    : { ...connection };

  const [requester, receiver] = await Promise.all([
    Device.findOne({ deviceId: plain.requesterId }).lean(),
    Device.findOne({ deviceId: plain.receiverId }).lean()
  ]);

  plain.requesterName = requester?.deviceName || plain.requesterId;
  plain.receiverName = receiver?.deviceName || plain.receiverId;

  if (currentDeviceId) {
    const isRequester = plain.requesterId === currentDeviceId;

    plain.peerDeviceId = isRequester
      ? plain.receiverId
      : plain.requesterId;

    plain.peerDeviceName = isRequester
      ? plain.receiverName
      : plain.requesterName;

    const peer = isRequester ? receiver : requester;
    plain.peerStatus = peer?.status || "offline";
    plain.peerConnectionCode = peer?.connectionCode || null;
  }

  return plain;
}

async function findPair(deviceA, deviceB) {
  return Connection.findOne({
    $or: [
      { requesterId: deviceA, receiverId: deviceB },
      { requesterId: deviceB, receiverId: deviceA }
    ]
  }).sort({ createdAt: -1 });
}

async function sendConnectionRequest(requesterId, receiverId) {
  if (!requesterId || !receiverId) {
    throw new Error("requesterId and receiverId are required");
  }

  if (requesterId === receiverId) {
    throw new Error("You cannot connect to your own device");
  }

  const [requester, receiver] = await Promise.all([
    Device.findOne({ deviceId: requesterId }),
    Device.findOne({ deviceId: receiverId })
  ]);

  if (!requester) {
    throw new Error("Requester device not found");
  }

  if (!receiver) {
    throw new Error("Receiver device not found");
  }

  const existing = await findPair(requesterId, receiverId);

  if (existing) {
    if (existing.status === "accepted") {
      throw new Error("These devices are already connected");
    }

    if (existing.status === "blocked") {
      throw new Error("This connection is blocked");
    }

    if (existing.status === "pending") {
      if (existing.requesterId === requesterId) {
        throw new Error("A connection request is already pending");
      }

      throw new Error(
        "This device already sent you a request. Open Connection Requests to accept it."
      );
    }

    if (existing.status === "rejected") {
      existing.requesterId = requesterId;
      existing.receiverId = receiverId;
      existing.status = "pending";
      existing.acceptedAt = null;
      existing.createdAt = new Date();
      await existing.save();

      return enrichConnection(existing, requesterId);
    }
  }

  const connection = await Connection.create({
    requesterId,
    receiverId,
    status: "pending"
  });

  return enrichConnection(connection, requesterId);
}

async function sendConnectionRequestByCode(requesterId, connectionCode) {
  if (!requesterId) {
    throw new Error("requesterId is required");
  }

  const normalizedCode = normalizeConnectionCode(connectionCode);

  if (normalizedCode.length !== 8) {
    throw new Error("Connection code must be 8 digits");
  }

  const receiver = await Device.findOne({
    connectionCode: normalizedCode
  });

  if (!receiver) {
    throw new Error("No device found with this connection code");
  }

  return sendConnectionRequest(requesterId, receiver.deviceId);
}

async function acceptConnection(connectionId) {
  if (!connectionId) {
    throw new Error("connectionId is required");
  }

  const connection = await Connection.findById(connectionId);

  if (!connection) {
    throw new Error("Connection request not found");
  }

  if (connection.status === "accepted") {
    return enrichConnection(connection);
  }

  if (connection.status !== "pending") {
    throw new Error("Only pending requests can be accepted");
  }

  connection.status = "accepted";
  connection.acceptedAt = new Date();
  await connection.save();

  return enrichConnection(connection, connection.receiverId);
}

async function rejectConnection(connectionId) {
  if (!connectionId) {
    throw new Error("connectionId is required");
  }

  const connection = await Connection.findById(connectionId);

  if (!connection) {
    throw new Error("Connection request not found");
  }

  if (connection.status !== "pending") {
    throw new Error("Only pending requests can be rejected");
  }

  connection.status = "rejected";
  connection.acceptedAt = null;
  await connection.save();

  return enrichConnection(connection, connection.receiverId);
}

async function getDeviceConnections(deviceId) {
  if (!deviceId) {
    throw new Error("deviceId is required");
  }

  const connections = await Connection.find({
    status: "accepted",
    $or: [
      { requesterId: deviceId },
      { receiverId: deviceId }
    ]
  }).sort({ acceptedAt: -1, createdAt: -1 });

  return Promise.all(
    connections.map((connection) =>
      enrichConnection(connection, deviceId)
    )
  );
}

async function getPendingRequests(deviceId) {
  if (!deviceId) {
    throw new Error("deviceId is required");
  }

  const requests = await Connection.find({
    receiverId: deviceId,
    status: "pending"
  }).sort({ createdAt: -1 });

  return Promise.all(
    requests.map((connection) =>
      enrichConnection(connection, deviceId)
    )
  );
}

async function areDevicesPaired(deviceA, deviceB) {
  const connection = await Connection.findOne({
    status: "accepted",
    $or: [
      { requesterId: deviceA, receiverId: deviceB },
      { requesterId: deviceB, receiverId: deviceA }
    ]
  });

  return Boolean(connection);
}

module.exports = {
  sendConnectionRequest,
  sendConnectionRequestByCode,
  acceptConnection,
  rejectConnection,
  getDeviceConnections,
  getPendingRequests,
  areDevicesPaired
};
