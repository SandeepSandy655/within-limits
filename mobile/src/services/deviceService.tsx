const SERVER_URL = "http://192.168.1.11:5000";

export interface RegisterDeviceData {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  platform: string;
}

export async function registerDevice(
  device: RegisterDeviceData
) {
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

  console.log(
    "[DEVICE] Registration response:",
    data
  );

  if (!response.ok || !data.success) {
    throw new Error(
      data.message ||
        "Device registration failed"
    );
  }

  return data.device;
}