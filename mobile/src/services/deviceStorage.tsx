import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { getFirebaseAuth } from './firebaseAuth';

export interface DeviceProfile { deviceId: string; deviceName: string; deviceType: string; platform: string; ownerId: string; connectionCode?: string | null; sharingEnabled?: boolean; }
const profiles = new Map<string, Promise<DeviceProfile>>();
export function getDeviceProfile(): Promise<DeviceProfile> {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) return Promise.reject(new Error('Sign in to register this device.'));
  if (!profiles.has(uid)) profiles.set(uid, (async () => {
    const stored = await AsyncStorage.getItem(`@within_limits_device_v2:${uid}`);
    if (stored) {
      try { const profile = JSON.parse(stored); if (profile.ownerId === uid && typeof profile.deviceId === 'string' && typeof profile.deviceName === 'string') return profile; } catch { /* Replace corrupt local preferences with a fresh identity. */ }
    }
    const profile: DeviceProfile = { deviceId: `DEV-${Crypto.randomUUID()}`, deviceName: Platform.OS === 'ios' ? 'My iPhone' : Platform.OS === 'android' ? 'My Android' : 'My browser', deviceType: 'mobile', platform: Platform.OS, ownerId: uid };
    await saveDeviceProfile(profile); return profile;
  })().catch((error) => { profiles.delete(uid); throw error; }));
  return profiles.get(uid)!;
}
export async function saveDeviceProfile(profile: DeviceProfile) {
  await AsyncStorage.setItem(`@within_limits_device_v2:${profile.ownerId}`, JSON.stringify(profile));
  profiles.set(profile.ownerId, Promise.resolve(profile));
}
export function formatConnectionCode(code?: string | null) { return code?.length === 8 ? `${code.slice(0, 4)} ${code.slice(4)}` : '---- ----'; }
