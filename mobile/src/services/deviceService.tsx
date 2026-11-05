import { api } from './api';
export interface RegisterDeviceData { deviceId: string; deviceName: string; deviceType: string; platform: string; }
export interface RegisteredDevice extends RegisterDeviceData { connectionCode: string | null; sharingEnabled: boolean; }
export async function registerDevice(device: RegisterDeviceData): Promise<RegisteredDevice> {
  return (await api<{ device: RegisteredDevice }>('/api/devices/register', device)).device;
}
export async function setLocationSharing(deviceId: string, sharingEnabled: boolean) { await api('/api/devices/sharing', { deviceId, sharingEnabled }); }
export async function getRegisteredDevice(deviceId: string) {
  return (await api<{ device: RegisteredDevice }>(`/api/devices/${encodeURIComponent(deviceId)}`)).device;
}
