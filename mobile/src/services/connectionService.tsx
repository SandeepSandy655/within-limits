import { api } from './api';
export const MAX_GROUP_DEVICES = 4;
export const CONNECTION_RANGES_METERS = [1000, 2000] as const;
export interface Connection {
  _id: string; requesterId: string; receiverId: string; requesterName?: string; receiverName?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'blocked'; createdAt: string; acceptedAt?: string | null; expiresAt?: string;
  rangeMeters: number; outOfRangeSince?: string | null;
}
export interface Device {
  deviceId: string; deviceName: string; deviceType?: string; platform?: string; status: 'online' | 'offline';
  location?: { type: 'Point'; coordinates: [number, number] } | null; lastSeen?: string | null;
  locationUpdatedAt?: string | null; accuracy?: number | null; sharingEnabled?: boolean;
  rangeMeters?: number; rangeState?: 'within-range' | 'out-of-range' | 'unavailable';
  distanceMeters?: number | null; outOfRangeSince?: string | null;
}
export interface HostPreview { deviceId: string; deviceName: string; status: string; occupied: number; available: number; maxDevices: number; }
export async function previewHost(deviceId: string, code: string) { return (await api<{ host: HostPreview }>(`/api/connections/preview?${new URLSearchParams({ deviceId, code })}`)).host; }
export async function sendConnectionRequestByCode(requesterId: string, connectionCode: string) { return (await api<{ connection: Connection }>('/api/connections/request-by-code', { requesterId, connectionCode })).connection; }
export async function getPendingRequests(deviceId: string) { return (await api<{ requests: Connection[] }>(`/api/connections/pending/${encodeURIComponent(deviceId)}`)).requests; }
export async function getAllConnections(deviceId: string) { return (await api<{ connections: Connection[] }>(`/api/connections/device/${encodeURIComponent(deviceId)}`)).connections; }
export async function getMyConnections(deviceId: string) { return (await getAllConnections(deviceId)).filter((c) => c.status === 'accepted'); }
async function decide(action: string, connectionId: string, deviceId: string) { return (await api<{ connection: Connection }>(`/api/connections/${action}`, { connectionId, deviceId })).connection; }
export async function acceptConnection(connectionId: string, deviceId: string, rangeMeters: number) {
  return (await api<{ connection: Connection }>('/api/connections/accept', { connectionId, deviceId, rangeMeters })).connection;
}
export const rejectConnection = (connectionId: string, deviceId: string) => decide('reject', connectionId, deviceId);
export const cancelConnection = (connectionId: string, deviceId: string) => decide('cancel', connectionId, deviceId);
export async function disconnectDevice(connectionId: string, deviceId: string) { await api('/api/connections/disconnect', { connectionId, deviceId }); }
export async function ringDevice(deviceId: string, targetDeviceId: string) { return api<{ delivered: boolean; message: string }>('/api/connections/ring', { deviceId, targetDeviceId }); }
export async function getConnectedDevices(deviceId: string) { return (await api<{ devices: Device[] }>(`/api/devices/connected/${encodeURIComponent(deviceId)}`)).devices; }
export async function getNearbyDevices(latitude: number, longitude: number, radius = 2000, deviceId?: string) {
  const query = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), radius: String(radius), deviceId: deviceId || '' });
  return (await api<{ devices: Device[] }>(`/api/devices/nearby?${query}`)).devices;
}
