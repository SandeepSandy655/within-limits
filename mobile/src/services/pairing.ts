import type { Connection } from './connectionService';

export function isActiveConnection(connection: Connection, now = Date.now()) {
  if (connection.status === 'accepted') return true;
  if (connection.status !== 'pending') return false;
  const expires = connection.expiresAt ? Date.parse(connection.expiresAt) : Date.parse(connection.createdAt) + 10 * 60_000;
  return Number.isFinite(expires) && expires > now;
}

export function groupCapacity(connections: Connection[], deviceId?: string, now = Date.now()) {
  const active = connections.filter((connection) => isActiveConnection(connection, now));
  const memberConnection = active.find((connection) => connection.requesterId === deviceId);
  const hosted = active.filter((connection) => connection.receiverId === deviceId);
  const joined = hosted.filter((connection) => connection.status === 'accepted').length;
  const pending = hosted.length - joined;
  return { memberConnection, joined, pending, occupied: hosted.length + 1, full: hosted.length >= 3 };
}

export function parsePairingCode(value: string): string | null {
  const text = value.trim();
  const plain = text.replace(/[\s-]/g, '');
  if (/^\d{8}$/.test(plain)) return plain;
  try {
    const url = new URL(text);
    if (url.protocol !== 'withinlimits:' || url.hostname !== 'connect' || (url.pathname && url.pathname !== '/')) return null;
    const code = url.searchParams.get('code');
    return code && /^\d{8}$/.test(code) ? code : null;
  } catch { return null; }
}
export const invitationLink = (code: string) => `withinlimits://connect?code=${code}`;
