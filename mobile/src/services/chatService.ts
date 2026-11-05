import { api } from './api';

export interface ChatGroup {
  hostId: string; joinedAt: string; membershipKey: string;
  members: { deviceId: string; deviceName: string; isHost: boolean }[];
}
export interface ChatMessage {
  id: string; hostId: string; senderId: string; senderName: string;
  clientMessageId: string; body: string; createdAt: string;
}
export interface ChatSummary { group: ChatGroup | null; unreadCount: number; }
export interface ChatPage { group: ChatGroup; messages: ChatMessage[]; hasMore: boolean; unreadCount: number; }
export const getChatSummary = (deviceId: string) => api<ChatSummary>(`/api/chat/device/${encodeURIComponent(deviceId)}/summary`);
export function getChatMessages(deviceId: string, direction?: 'before' | 'after', cursor?: string) {
  const query = direction && cursor ? `?${direction}=${encodeURIComponent(cursor)}` : '';
  return api<ChatPage>(`/api/chat/device/${encodeURIComponent(deviceId)}${query}`);
}
export const sendChatMessage = (deviceId: string, membershipKey: string, clientMessageId: string, body: string) =>
  api<{ message: ChatMessage; created: boolean }>('/api/chat/messages', { deviceId, membershipKey, clientMessageId, body });
export const markChatRead = (deviceId: string, membershipKey: string, messageId: string) =>
  api('/api/chat/read', { deviceId, membershipKey, messageId });
