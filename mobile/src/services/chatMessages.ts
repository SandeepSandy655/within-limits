import type { ChatMessage } from './chatService';

// PostgreSQL IDs are strings; converting BIGINTs to Number can reorder messages.
export function mergeChatMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const messages = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) messages.set(message.id, message);
  return [...messages.values()].sort((a, b) => a.id.length - b.id.length || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
