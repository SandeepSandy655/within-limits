import { io, type Socket } from 'socket.io-client';
import { getFirebaseAuth } from './firebaseAuth';
import { SERVER_URL } from './serverConfig';
let socket: Socket | null = null;
let currentDeviceId = '';
export function connectSocket(deviceId: string): Socket {
  if (socket && currentDeviceId === deviceId) return socket;
  disconnectSocket(); currentDeviceId = deviceId;
  const next = io(SERVER_URL, {
    autoConnect: false,
    auth: (callback) => { const user = getFirebaseAuth().currentUser; if (user) void user.getIdToken().then((token) => callback({ token, deviceId })).catch(() => callback({ deviceId })); else callback({ deviceId }); },
    reconnectionDelay: 1000, reconnectionDelayMax: 10_000, timeout: 15_000,
  });
  let replaced = false;
  next.on('device-replaced', () => { replaced = true; });
  next.on('connect', () => { next.emit('device-online', { deviceId }); });
  next.on('disconnect', (reason) => { if (reason === 'io server disconnect' && next === socket && !replaced) next.connect(); });
  socket = next; next.connect(); return next;
}
export function getSocket() { return socket; }
export function disconnectSocket() { const previous = socket; socket = null; currentDeviceId = ''; previous?.removeAllListeners(); previous?.disconnect(); }
