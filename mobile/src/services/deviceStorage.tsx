import AsyncStorage from "@react-native-async-storage/async-storage";

const DEVICE_KEY = "@sand_device";

export interface DeviceProfile {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  platform: string;
  connectionCode?: string;
}

const DEVICE_NAMES = [
  "SAND Falcon",
  "SAND Nova",
  "SAND Orbit",
  "SAND Pulse",
  "SAND Titan",
  "SAND Spark",
  "SAND Echo",
  "SAND Atlas",
  "SAND Vector",
  "SAND Zenith",
  "SAND Comet",
  "SAND Shadow",
  "SAND Storm",
  "SAND Phoenix",
  "SAND Voyager",
];

function generateDeviceId(): string {
  const randomPart = Math.random()
    .toString(36)
    .substring(2, 8)
    .toUpperCase();

  return `FNT-${randomPart}`;
}

function generateDeviceName(): string {
  const randomIndex = Math.floor(
    Math.random() * DEVICE_NAMES.length
  );

  return DEVICE_NAMES[randomIndex];
}

export async function getDeviceProfile(): Promise<DeviceProfile> {
  const stored =
    await AsyncStorage.getItem(DEVICE_KEY);

  if (stored) {
    return JSON.parse(stored);
  }

  const profile: DeviceProfile = {
    deviceId: generateDeviceId(),
    deviceName: generateDeviceName(),
    deviceType: "mobile",
    platform: "android",
  };

  await AsyncStorage.setItem(
    DEVICE_KEY,
    JSON.stringify(profile)
  );

  console.log(
    "[DEVICE] New local profile created:",
    profile
  );

  return profile;
}

export async function saveDeviceProfile(
  profile: DeviceProfile
): Promise<DeviceProfile> {
  await AsyncStorage.setItem(
    DEVICE_KEY,
    JSON.stringify(profile)
  );

  return profile;
}

export function formatConnectionCode(
  code?: string | null
): string {
  const digits = String(code || "").replace(/\D/g, "");

  if (digits.length !== 8) {
    return digits || "--------";
  }

  return `${digits.slice(0, 4)} ${digits.slice(4)}`;
}