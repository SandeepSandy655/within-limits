import { SERVER_URL } from "./serverConfig";

export interface Connection {
  _id: string;

  requesterId: string;

  receiverId: string;
  requesterName?: string;
  receiverName?: string;

  status:
    | "pending"
    | "accepted"
    | "rejected"
    | "blocked";

  createdAt: string;

  acceptedAt?: string | null;
}

export interface Device {
  deviceId: string;
  deviceName: string;
  deviceType?: string;
  platform?: string;
  status: "online" | "offline";
  location?: { type: "Point"; coordinates: [number, number] };
  lastSeen?: string | null;
}

// =====================================================
// SEND REQUEST USING CODE
// =====================================================

export async function sendConnectionRequestByCode(
  requesterId: string,
  connectionCode: string
): Promise<Connection> {
  const response =
    await fetch(
      `${SERVER_URL}/api/connections/request-by-code`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          requesterId,
          connectionCode,
        }),
      }
    );

  const data =
    await response.json();

  if (
    !response.ok ||
    !data.success
  ) {
    throw new Error(
      data.message ||
        "Failed to send connection request"
    );
  }

  return data.connection;
}

// =====================================================
// GET PENDING REQUESTS
// =====================================================

export async function getPendingRequests(
  deviceId: string
): Promise<Connection[]> {
  const response =
    await fetch(
      `${SERVER_URL}/api/connections/pending/${deviceId}`
    );

  const data =
    await response.json();

  if (
    !response.ok ||
    !data.success
  ) {
    throw new Error(
      data.message ||
        "Failed to get connection requests"
    );
  }

  return data.requests;
}

// =====================================================
// ACCEPT
// =====================================================

export async function acceptConnection(
  connectionId: string,
  deviceId: string
): Promise<Connection> {
  const response =
    await fetch(
      `${SERVER_URL}/api/connections/accept`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          connectionId,
          deviceId,
        }),
      }
    );

  const data =
    await response.json();

  if (
    !response.ok ||
    !data.success
  ) {
    throw new Error(
      data.message ||
        "Failed to accept connection"
    );
  }

  return data.connection;
}

// =====================================================
// REJECT
// =====================================================

export async function rejectConnection(
  connectionId: string,
  deviceId: string
): Promise<Connection> {
  const response =
    await fetch(
      `${SERVER_URL}/api/connections/reject`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          connectionId,
          deviceId,
        }),
      }
    );

  const data =
    await response.json();

  if (
    !response.ok ||
    !data.success
  ) {
    throw new Error(
      data.message ||
        "Failed to reject connection"
    );
  }

  return data.connection;
}

// =====================================================
// GET ALL CONNECTIONS
// =====================================================

export async function getMyConnections(
  deviceId: string
): Promise<Connection[]> {
  const response =
    await fetch(
      `${SERVER_URL}/api/connections/device/${deviceId}`
    );

  const data =
    await response.json();

  if (
    !response.ok ||
    !data.success
  ) {
    throw new Error(
      data.message ||
        "Failed to get connections"
    );
  }

  return data.connections.filter(
    (connection: Connection) =>
      connection.status === "accepted"
  );
}

export async function disconnectDevice(
  connectionId: string,
  deviceId: string
): Promise<void> {
  const response = await fetch(`${SERVER_URL}/api/connections/disconnect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId, deviceId }),
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || "Failed to disconnect device");
  }
}

export async function ringDevice(
  deviceId: string,
  targetDeviceId: string
): Promise<void> {
  const response = await fetch(`${SERVER_URL}/api/connections/ring`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, targetDeviceId }),
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || "Could not send the buzzer");
  }
}

export async function getNearbyDevices(
  latitude: number,
  longitude: number,
  radius = 5000,
  deviceId?: string
): Promise<Device[]> {
  const query = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    radius: String(radius),
    ...(deviceId ? { deviceId } : {}),
  });
  const response = await fetch(`${SERVER_URL}/api/devices/nearby?${query}`);
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || "Failed to find nearby devices");
  }
  return data.devices;
}

export async function getConnectedDevices(deviceId: string): Promise<Device[]> {
  const response = await fetch(`${SERVER_URL}/api/devices/connected/${encodeURIComponent(deviceId)}`);
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || "Failed to load connected devices");
  }
  return data.devices;
}
