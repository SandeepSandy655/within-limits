const SERVER_URL = "http://192.168.1.11:5000";

export interface Device {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  platform: string;
  status: "online" | "offline";
  location?: {
    type: string;
    coordinates: [number, number];
  };
  lastSeen?: string;
}

export interface Connection {
  _id: string;
  requesterId: string;
  receiverId: string;
  requesterName?: string;
  receiverName?: string;
  peerDeviceId?: string;
  peerDeviceName?: string;
  peerStatus?: "online" | "offline";
  peerConnectionCode?: string | null;
  status: "pending" | "accepted" | "rejected" | "blocked";
  createdAt: string;
  acceptedAt?: string | null;
}

export async function getNearbyDevices(
  latitude: number,
  longitude: number,
  radius = 5000
): Promise<Device[]> {
  const response = await fetch(
    `${SERVER_URL}/api/devices/nearby?latitude=${latitude}&longitude=${longitude}&radius=${radius}`
  );

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(
      data.message || "Failed to get nearby devices"
    );
  }

  return data.devices;
}

export async function sendConnectionRequest(
  requesterId: string,
  receiverId: string
): Promise<Connection> {
  const response = await fetch(
    `${SERVER_URL}/api/connections/request`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        requesterId,
        receiverId,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(
      data.message ||
        "Failed to send connection request"
    );
  }

  return data.connection;
}

export async function getPendingRequests(
  deviceId: string
): Promise<Connection[]> {
  const response = await fetch(
    `${SERVER_URL}/api/connections/pending/${deviceId}`
  );

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(
      data.message ||
        "Failed to get connection requests"
    );
  }

  return data.requests;
}

export async function acceptConnection(
  connectionId: string
): Promise<Connection> {
  const response = await fetch(
    `${SERVER_URL}/api/connections/accept`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        connectionId,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(
      data.message ||
        "Failed to accept connection"
    );
  }

  return data.connection;
}


export async function rejectConnection(
  connectionId: string
): Promise<Connection> {
  const response = await fetch(
    `${SERVER_URL}/api/connections/reject`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        connectionId,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(
      data.message ||
        "Failed to reject connection"
    );
  }

  return data.connection;
}

export async function getMyConnections(
  deviceId: string
): Promise<Connection[]> {
  const response = await fetch(
    `${SERVER_URL}/api/connections/device/${deviceId}`
  );

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(
      data.message ||
        "Failed to get connections"
    );
  }


  return data.connections;
}

export async function sendConnectionRequestByCode(
  requesterId: string,
  connectionCode: string
): Promise<Connection> {
  const response = await fetch(
    `${SERVER_URL}/api/connections/request-by-code`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requesterId,
        connectionCode,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(
      data.message ||
        "Failed to send connection request"
    );
  }

  return data.connection;
}