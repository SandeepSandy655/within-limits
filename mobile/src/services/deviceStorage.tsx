import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";

const DEVICE_KEY = "@sand_device";

export interface DeviceProfile {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  platform: string;

  // Received from backend
  connectionCode?: string;
}

function generateDeviceId(): string {
  return `DEV-${Crypto.randomUUID()}`;
}

export async function getDeviceProfile(): Promise<DeviceProfile> {
  const stored =
    await AsyncStorage.getItem(
      DEVICE_KEY
    );

  if (stored) {
    return JSON.parse(stored);
  }

  const profile: DeviceProfile = {
    deviceId: generateDeviceId(),
    deviceName: Platform.OS === "ios" ? "My iPhone" : Platform.OS === "android" ? "My Android device" : "My device",
    deviceType: "mobile",
    platform: Platform.OS,
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
): Promise<void> {
  await AsyncStorage.setItem(
    DEVICE_KEY,
    JSON.stringify(profile)
  );
}

export function formatConnectionCode(
  code?: string
): string {
  if (!code) {
    return "--------";
  }

  const cleanCode = code.replace(
    /\D/g,
    ""
  );

  if (cleanCode.length !== 8) {
    return cleanCode;
  }

  return `${cleanCode.slice(
    0,
    4
  )} ${cleanCode.slice(4)}`;
}
