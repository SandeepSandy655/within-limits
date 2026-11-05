
import Constants from 'expo-constants';
import { isDevice } from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveServerAddress, validateBackendAddress } from './serverAddress';

export const CAN_CONFIGURE_BACKEND = __DEV__ || process.env.EXPO_PUBLIC_LOCAL_BACKEND === 'true';
export let SERVER_URL = resolveServerAddress({
  configuredUrl: process.env.EXPO_PUBLIC_API_URL,
  development: __DEV__,
  platform: Platform.OS,
  metroHost: Constants.expoConfig?.hostUri,
  browserHostname: Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.hostname : undefined,
  physicalDevice: isDevice,
  allowLocalBackend: CAN_CONFIGURE_BACKEND,
});

const ADDRESS_KEY = '@within_limits_backend_v1';
const listeners = new Set<() => void>();
let loaded: Promise<void> | null = null;
export const getServerAddress = () => SERVER_URL;
export const subscribeServerAddress = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function initializeServerAddress(): Promise<void> {
  if (!loaded) loaded = (async () => {
    if (!CAN_CONFIGURE_BACKEND) return;
    try {
      const saved = await AsyncStorage.getItem(ADDRESS_KEY);
      if (saved) SERVER_URL = validateBackendAddress(saved, true);
    } catch { /* Keep the configured default if an old preference is invalid or storage is unavailable. */ }
    listeners.forEach((listener) => listener());
  })();
  return loaded;
}
export async function saveServerAddress(value: string) {
  if (!CAN_CONFIGURE_BACKEND) throw new Error('This release uses its configured hosted backend.');
  const address = validateBackendAddress(value, true);
  const host = new URL(address).hostname;
  if (Platform.OS !== 'web' && isDevice && ['localhost', '127.0.0.1', '[::1]'].includes(host)) {
    throw new Error('Use your laptop’s Wi-Fi address. On a phone, localhost points to the phone itself.');
  }
  await AsyncStorage.setItem(ADDRESS_KEY, address);
  SERVER_URL = address;
  listeners.forEach((listener) => listener());
}

export function backendConnectionError(error: unknown): Error | null {
  if (!(error instanceof Error)) return null;
  const endpoint = __DEV__ ? ` (${SERVER_URL})` : '';
  if (error.name === 'AbortError') {
    return new Error(`The server took too long to respond${endpoint}. Check your connection and try again.`);
  }
  if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) {
    return new Error(`Unable to reach the server${endpoint}. Check your connection and that the backend is running, then try again.`);
  }
  return null;
}
