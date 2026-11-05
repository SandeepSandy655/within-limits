import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Alert, AppState, Vibration } from 'react-native';
import { useAuth } from './AuthProvider';
import { type DeviceProfile, getDeviceProfile, saveDeviceProfile } from '../services/deviceStorage';
import { getRegisteredDevice, registerDevice, setLocationSharing } from '../services/deviceService';
import { type Connection, type Device, getAllConnections, getConnectedDevices } from '../services/connectionService';
import { connectSocket, disconnectSocket, getSocket } from '../services/socketService';
import { type DeviceLocation, type LocationAccessOptions, locationAccessAvailable, requestLocationAccess, startLiveLocation, stopLiveLocation } from '../services/locationService';
import { getNotifications, markNotificationsRead, type GroupNotification } from '../services/notificationService';
import { getChatSummary, type ChatSummary } from '../services/chatService';

interface DeviceState {
  profile: DeviceProfile | null; devices: Device[]; connections: Connection[]; loading: boolean;
  online: boolean; sharing: boolean; location: DeviceLocation | null; locationError: string; error: string;
  connectionsReady: boolean; locationAvailable: boolean | null; locationRequestPending: boolean;
  notifications: GroupNotification[]; unreadCount: number; notificationError: string;
  chat: ChatSummary; chatError: string; chatRevision: number; refreshChat: () => Promise<void>;
  refreshNotifications: () => Promise<void>; markRead: (ids: string[]) => Promise<void>; enableSharing: (options?: LocationAccessOptions) => Promise<void>;
  requestMapLocation: () => Promise<void>;
  refresh: () => Promise<void>; retry: () => void; rename: (name: string) => Promise<void>; toggleSharing: () => Promise<void>;
}
const DeviceContext = createContext<DeviceState | null>(null);
export function DeviceProvider({ children }: PropsWithChildren) {
  const { user, canAccessApp } = useAuth();
  const uid = user?.uid;
  const [profile, setProfile] = useState<DeviceProfile | null>(null);
  const profileRef = useRef<DeviceProfile | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionsReady, setConnectionsReady] = useState(false);
  const [notifications, setNotifications] = useState<GroupNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationError, setNotificationError] = useState('');
  const [chat, setChat] = useState<ChatSummary>({ group: null, unreadCount: 0 });
  const [chatError, setChatError] = useState('');
  const [chatRevision, setChatRevision] = useState(0);
  const chatRequest = useRef(0);
  const notificationRevision = useRef(0);
  const notificationIds = useRef(new Set<string>());
  const deviceRevision = useRef(0);
  const peerUpdates = useRef(new Map<string, { revision: number; patch: Partial<Device> }>());
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [locationAvailable, setLocationAvailable] = useState<boolean | null>(null);
  const [locationRequestPending, setLocationRequestPending] = useState(false);
  const sharingOperation = useRef<Promise<void> | null>(null);
  const initialLocationDevice = useRef<string | null>(null);
  const setupGeneration = useRef(0);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');
  const [location, setLocation] = useState<DeviceLocation | null>(null);
  const [locationError, setLocationError] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const refreshInFlight = useRef(false);
  const checkLocationAccess = useCallback(async () => {
    const available = await locationAccessAvailable();
    setLocationAvailable(available);
    if (!available) { stopLiveLocation(); setLocation(null); }
    else if (profileRef.current && profileRef.current.sharingEnabled !== false) { setSharing(true); setLocationError(''); }
    return available;
  }, []);
  const refreshNotifications = useCallback(async () => {
    const current = profileRef.current;
    if (!current) return;
    const revision = notificationRevision.current;
    try {
      const result = await getNotifications(current.deviceId);
      if (profileRef.current?.deviceId !== current.deviceId || revision !== notificationRevision.current) return;
      setNotifications(result.notifications); setUnreadCount(result.unreadCount); setNotificationError('');
      notificationIds.current = new Set(result.notifications.map((notification) => notification.id));
    } catch (e) {
      if (profileRef.current?.deviceId === current.deviceId) setNotificationError(e instanceof Error ? e.message : 'Could not load notifications.');
    }
  }, []);
  const refresh = useCallback(async () => {
    const current = profileRef.current;
    if (!current || refreshInFlight.current) return;
    refreshInFlight.current = true;
    const revision = deviceRevision.current;
    try {
      const [links, peers, registered] = await Promise.all([getAllConnections(current.deviceId), getConnectedDevices(current.deviceId), getRegisteredDevice(current.deviceId)]);
      if (profileRef.current?.deviceId === current.deviceId) {
        setConnections(links);
        setDevices(peers.map((peer) => {
          const update = peerUpdates.current.get(peer.deviceId);
          return update && update.revision > revision ? { ...peer, ...update.patch } : peer;
        }));
        for (const [id, update] of peerUpdates.current) {
          if (update.revision <= revision) peerUpdates.current.delete(id);
        }
        setConnectionsReady(true); setError('');
        const updated = { ...profileRef.current, connectionCode: registered.connectionCode };
        profileRef.current = updated; setProfile(updated);
      }
    } catch (e) { if (profileRef.current?.deviceId === current.deviceId) setError(e instanceof Error ? e.message : 'Could not refresh your group.'); }
    finally { refreshInFlight.current = false; }
  }, []);
  const refreshChat = useCallback(async () => {
    const current = profileRef.current;
    if (!current) return;
    const request = ++chatRequest.current;
    try {
      const result = await getChatSummary(current.deviceId);
      if (profileRef.current?.deviceId !== current.deviceId || request !== chatRequest.current) return;
      setChat(result); setChatError('');
    } catch (e) {
      if (profileRef.current?.deviceId === current.deviceId && request === chatRequest.current) setChatError(e instanceof Error ? e.message : 'Could not load group chat.');
    }
  }, []);
  async function markRead(ids: string[]) {
    const current = profileRef.current;
    if (!current || !ids.length) return;
    await markNotificationsRead(current.deviceId, ids);
    notificationRevision.current++;
    await refreshNotifications();
  }
  const enableSharing = useCallback((options?: LocationAccessOptions): Promise<void> => {
    if (sharingOperation.current) return sharingOperation.current;
    const current = profileRef.current;
    if (!current) return Promise.resolve();
    const generation = setupGeneration.current;
    const stillCurrent = () => generation === setupGeneration.current && profileRef.current?.deviceId === current.deviceId;
    setLocationRequestPending(true);
    const operation = Promise.resolve().then(async () => {
      try {
        await requestLocationAccess(options);
        if (!stillCurrent()) return;
        await setLocationSharing(current.deviceId, true);
        if (!stillCurrent()) return;
        const updated = { ...profileRef.current!, sharingEnabled: true };
        await saveDeviceProfile(updated);
        if (!stillCurrent()) return;
        profileRef.current = updated; setProfile(updated);
        setLocationAvailable(true); setSharing(true); setLocationError('');
        await refresh();
      } catch (error) {
        if (stillCurrent()) setLocationError(error instanceof Error ? error.message : 'Could not enable location sharing.');
        throw error;
      } finally {
        if (sharingOperation.current === operation) sharingOperation.current = null;
        if (stillCurrent()) setLocationRequestPending(false);
      }
    });
    sharingOperation.current = operation;
    return operation;
  }, [refresh]);
  const requestMapLocation = useCallback(() => {
    // A declined OS request leaves the preference unset. A deliberate pause stays off.
    if (profileRef.current?.sharingEnabled === false) return Promise.resolve();
    return enableSharing();
  }, [enableSharing]);
  useEffect(() => {
    let active = true;
    if (!uid || !canAccessApp) return;
    const generation = ++setupGeneration.current;
    (async () => {
      const local = await getDeviceProfile();
      if (!active) return;
      const registered = await registerDevice(local);
      if (!active) return;
      const updated = { ...local, connectionCode: registered.connectionCode, deviceName: registered.deviceName };
      await saveDeviceProfile(updated);
      // Available OS access enables sharing by default; an explicit local pause is retained.
      const available = await checkLocationAccess();
      await setLocationSharing(updated.deviceId, updated.sharingEnabled !== false && available);
      if (!active) return;
      profileRef.current = updated; setProfile(updated); setSharing(updated.sharingEnabled !== false && available);
      const socket = connectSocket(updated.deviceId);
      socket.on('device-ready', () => {
        void checkLocationAccess().then((enabled) => setLocationSharing(updated.deviceId, profileRef.current?.sharingEnabled !== false && enabled)).then(() => { if (active) { setOnline(true); setError(''); void refresh(); void refreshNotifications(); } }).catch(() => { if (active) setError('Could not sync your location-sharing preference. Retry setup when connected.'); });
      });
      socket.on('device-replaced', () => { setOnline(false); setError('This installation is open in another session. Close the other session and retry here.'); });
      socket.on('disconnect', () => setOnline(false));
      socket.on('connect_error', () => { setOnline(false); setError('Live connection unavailable. Reconnecting…'); });
      socket.on('device-error', (data: { message?: string }) => setLocationError(data.message || 'Unable to share your location.'));
      socket.on('device-location', (fix: DeviceLocation & Pick<Device, 'rangeState' | 'rangeMeters' | 'distanceMeters'>) => {
        const patch: Partial<Device> = {
          location: { type: 'Point', coordinates: [fix.longitude, fix.latitude] }, locationUpdatedAt: fix.timestamp,
          accuracy: fix.accuracy, status: 'online', sharingEnabled: true, rangeState: fix.rangeState,
          rangeMeters: fix.rangeMeters, distanceMeters: fix.distanceMeters };
        peerUpdates.current.set(fix.deviceId, { revision: ++deviceRevision.current, patch });
        setDevices((current) => current.map((peer) => peer.deviceId === fix.deviceId ? { ...peer, ...patch } : peer));
      });
      socket.on('device-location-unavailable', (data: Pick<Device, 'deviceId' | 'rangeState' | 'rangeMeters' | 'distanceMeters'>) => {
        const patch: Partial<Device> = { ...data, location: null };
        peerUpdates.current.set(data.deviceId, { revision: ++deviceRevision.current, patch });
        setDevices((current) => current.map((peer) => peer.deviceId === data.deviceId ? { ...peer, ...patch } : peer));
      });
      for (const event of ['connection-request', 'connection-accepted', 'connection-rejected', 'connection-disconnected', 'connection-range-changed', 'device-status', 'sharing-changed']) socket.on(event, () => { void refresh(); void refreshChat(); });
      socket.on('chat-message', () => { if (active) { setChatRevision((revision) => revision + 1); void refreshChat(); } });
      socket.on('notification', ({ notification }: { notification: GroupNotification }) => {
        if (!active || notification.deviceId !== updated.deviceId || notificationIds.current.has(notification.id)) return;
        notificationIds.current.add(notification.id); notificationRevision.current++;
        setNotifications((current) => [notification, ...current].slice(0, 100));
        if (!notification.readAt) setUnreadCount((count) => count + 1);
        if (['out-of-range', 'host-searching', 'member-searching'].includes(notification.kind)) Alert.alert(notification.title, notification.body);
      });
      socket.on('device-buzzer', () => Vibration.vibrate([0, 350, 150, 350]));
      await Promise.all([refresh(), refreshNotifications(), refreshChat()]);
    })().catch((e) => { if (active) setError(e instanceof Error ? e.message : 'Could not register this device.'); }).finally(() => { if (active) setLoading(false); });
    const timer = setInterval(() => { if (AppState.currentState !== 'background') { void refresh(); void refreshNotifications(); void refreshChat(); void checkLocationAccess().catch(() => undefined); } }, 10_000);
    return () => { active = false; setupGeneration.current = generation + 1; profileRef.current = null; sharingOperation.current = null; clearInterval(timer); stopLiveLocation(); disconnectSocket(); };
  }, [uid, canAccessApp, attempt, refresh, refreshNotifications, refreshChat, checkLocationAccess]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      const isActive = state === 'active'; setForeground(isActive);
      if (isActive) { getSocket()?.connect(); void refresh(); void refreshNotifications(); void refreshChat(); void checkLocationAccess().catch(() => undefined); } else { stopLiveLocation(); getSocket()?.disconnect(); setOnline(false); }
    });
    return () => listener.remove();
  }, [refresh, refreshNotifications, refreshChat, checkLocationAccess]);
  const activeDeviceId = profile?.deviceId;
  useEffect(() => {
    if (loading || !activeDeviceId || initialLocationDevice.current === activeDeviceId) return;
    initialLocationDevice.current = activeDeviceId;
    if (profileRef.current?.sharingEnabled === false || (sharing && locationAvailable)) return;
    // A refusal is non-fatal. Retry only on a later Map visit or a direct user action.
    void enableSharing({ showSettings: false }).catch(() => undefined);
  }, [activeDeviceId, loading, sharing, locationAvailable, enableSharing]);
  useEffect(() => {
    let active = true;
    if (activeDeviceId && sharing && locationAvailable && foreground && online) {
      void startLiveLocation(activeDeviceId, (fix) => { if (active) { setLocation(fix); setLocationError(''); } }, (message) => { if (active) setLocationError(message); }).catch((e) => { if (active) setLocationError(e instanceof Error ? e.message : 'GPS unavailable.'); });
    } else stopLiveLocation();
    return () => { active = false; stopLiveLocation(); };
  }, [activeDeviceId, sharing, locationAvailable, foreground, online]);
  useEffect(() => {
    if (!activeDeviceId || !online || locationAvailable === null) return;
    void setLocationSharing(activeDeviceId, sharing && locationAvailable).catch(() => setLocationError('Could not sync location sharing. Please try again.'));
  }, [activeDeviceId, online, sharing, locationAvailable]);

  async function toggleSharing() {
    if (!profile) return;
    if (!sharing) return enableSharing();
    // Finish any concurrent enable before persisting a deliberate pause.
    await sharingOperation.current?.catch(() => undefined);
    if (profileRef.current?.deviceId !== profile.deviceId) return;
    const next = !sharing;
    if (!next) {
      stopLiveLocation(); setSharing(false); setLocation(null);
      const paused = { ...profile, sharingEnabled: false };
      profileRef.current = paused; setProfile(paused); await saveDeviceProfile(paused);
    }
    await setLocationSharing(profile.deviceId, next);
    const updated = { ...profile, sharingEnabled: next };
    await saveDeviceProfile(updated); profileRef.current = updated; setProfile(updated);
    setSharing(next); setLocationError(''); await refresh();
  }
  async function rename(name: string) {
    if (!profile) return;
    if (!name.trim()) throw new Error('Enter a device name.');
    const registered = await registerDevice({ ...profile, deviceName: name.trim() });
    const updated = { ...profile, deviceName: registered.deviceName };
    await saveDeviceProfile(updated); profileRef.current = updated; setProfile(updated);
  }
  return <DeviceContext.Provider value={{ profile, devices, connections, connectionsReady, loading, online, sharing,
    location, locationAvailable, locationRequestPending, locationError, error, notifications, unreadCount, notificationError, refreshNotifications, markRead,
    chat, chatError, chatRevision, refreshChat,
    refresh, retry: () => { setLoading(true); setConnectionsReady(false); setError(''); setOnline(false); setProfile(null); setLocation(null); setLocationRequestPending(false); setAttempt((n) => n + 1); }, rename, toggleSharing, enableSharing, requestMapLocation }}>{children}</DeviceContext.Provider>;
}
export function useDevice() { const state = useContext(DeviceContext); if (!state) throw new Error('Device provider is missing.'); return state; }
