import * as Location from 'expo-location';
import { Alert, Linking, Platform } from 'react-native';
import { getSocket } from './socketService';
export interface DeviceLocation { deviceId: string; latitude: number; longitude: number; accuracy: number | null; speed: number | null; heading: number | null; timestamp: string; }
let subscription: Location.LocationSubscription | null = null;
let generation = 0;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let latest: DeviceLocation | null = null;
let sentAt = 0;
let permissionRequest: Promise<void> | null = null;
export type LocationAccessOptions = { showSettings?: boolean };

export async function locationAccessAvailable() {
  const [permission, services] = await Promise.all([Location.getForegroundPermissionsAsync(), Location.hasServicesEnabledAsync()]);
  return permission.granted && services;
}

export function requestLocationAccess(options: LocationAccessOptions = {}): Promise<void> {
  if (permissionRequest) return permissionRequest;
  const pending = requestLocationAccessOnce(options).finally(() => {
    if (permissionRequest === pending) permissionRequest = null;
  });
  permissionRequest = pending;
  return pending;
}

async function requestLocationAccessOnce({ showSettings = true }: LocationAccessOptions) {
  const previous = await Location.getForegroundPermissionsAsync();
  const permission = previous.granted || !previous.canAskAgain ? previous : await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) {
    // After a denial, let the user continue. Offer Settings on a later attempt
    // only when the OS can no longer display its permission request.
    if (!previous.canAskAgain && showSettings && Platform.OS !== 'web') {
      Alert.alert('Allow location access', 'Enable location access for Within Limits in Settings, then try again.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open settings', onPress: () => { void Linking.openSettings().catch(() => undefined); } },
      ]);
    }
    throw new Error('Allow location access in your device or browser settings to start sharing.');
  }
  if (!await Location.hasServicesEnabledAsync()) {
    if (Platform.OS === 'android') {
      try { await Location.enableNetworkProviderAsync(); }
      catch { throw new Error('Location is still off. Accept the location request to start sharing.'); }
    } else if (Platform.OS === 'ios' && showSettings) {
      Alert.alert('Turn on Location Services', 'Open Settings → Privacy & Security → Location Services, turn it on, then return here.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open settings', onPress: () => { void Linking.openSettings().catch(() => undefined); } },
      ]);
    }
    if (!await Location.hasServicesEnabledAsync()) throw new Error('Turn on Location Services, then try again.');
  }
}

export async function startLiveLocation(deviceId: string, onLocation?: (location: DeviceLocation) => void, onError?: (message: string) => void) {
  stopLiveLocation(); const ownGeneration = generation;
  const permission = await Location.getForegroundPermissionsAsync();
  if (!permission.granted) throw new Error('Allow location access in Settings to share your position.');
  if (!await Location.hasServicesEnabledAsync()) throw new Error('Turn on GPS / Location Services, then try again.');
  if (generation !== ownGeneration) return;
  const send = () => {
    const socket = getSocket();
    // Do not queue coordinates while offline or resend an old fix as a new one.
    if (socket?.connected && latest && Date.now() - Date.parse(latest.timestamp) < 30_000 && Date.now() - sentAt >= 5000) { socket.volatile.emit('device-location', latest); sentAt = Date.now(); }
  };
  const next = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 10_000, distanceInterval: 0 }, (fix) => {
    if (generation !== ownGeneration) return;
    latest = { deviceId, ...fix.coords, timestamp: new Date(fix.timestamp).toISOString() };
    onLocation?.(latest); send();
  }, (message) => onError?.(message));
  if (generation !== ownGeneration) { next.remove(); return; }
  subscription = next; heartbeat = setInterval(send, 15_000);
}
export function stopLiveLocation() { generation++; subscription?.remove(); subscription = null; if (heartbeat) clearInterval(heartbeat); heartbeat = null; latest = null; sentAt = 0; }
