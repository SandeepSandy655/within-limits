import { SERVER_URL } from "./serverConfig";

export interface RegisterDeviceData {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  platform: string;
}

export interface RegisteredDevice {
  _id: string;
  deviceId: string;
  connectionCode: string;
  deviceName: string;
  deviceType: string;
  platform: string;
  status: "online" | "offline";
  lastSeen?: string | null;
}

export async function registerDevice(
  device: RegisterDeviceData
): Promise<RegisteredDevice> {
  console.log(
    "[DEVICE] Registering device..."
  );

  console.log(
    "[DEVICE] ID:",
    device.deviceId
  );

  console.log(
    "[DEVICE] Name:",
    device.deviceName
  );

  const response = await fetch(
    `${SERVER_URL}/api/devices/register`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        deviceType: device.deviceType,
        platform: device.platform,
      }),
    }
  );

  const data = await response.json();

  if (
    !response.ok ||
    !data.success
  ) {
    throw new Error(
      data.message ||
        "Device registration failed"
    );
  }

  return data.device;
}
