import {
  io,
  Socket,
} from "socket.io-client";

const SERVER_URL =
  "http://192.168.1.11:5000";

let socket: Socket | null = null;

export function connectSocket(
  deviceId: string
): Socket {
  if (socket?.connected) {
    return socket;
  }

  socket = io(SERVER_URL, {
    transports: [
      "polling",
      "websocket",
    ],
  });

  socket.on("connect", () => {
    console.log(
      "[SOCKET] Connected:",
      socket?.id
    );

    socket?.emit("device-online", {
      deviceId,
    });

    socket?.emit("webrtc-register", {
      deviceId,
    });
  });

  socket.on(
    "connect_error",
    (error) => {
      console.log(
        "[SOCKET] Error:",
        error.message
      );
    }
  );

  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}