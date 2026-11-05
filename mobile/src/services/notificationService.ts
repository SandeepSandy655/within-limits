import { api } from './api';

export interface GroupNotification {
  id: string; deviceId: string; kind: string; title: string; body: string;
  relatedDeviceId?: string | null; connectionId?: string | null;
  createdAt: string; readAt: string | null;
}

export async function getNotifications(deviceId: string) {
  return api<{ notifications: GroupNotification[]; unreadCount: number }>(`/api/notifications/device/${encodeURIComponent(deviceId)}`);
}

export async function markNotificationsRead(deviceId: string, ids: string[]) {
  await api('/api/notifications/read', { deviceId, ids });
}
