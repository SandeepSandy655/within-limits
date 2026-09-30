import {
  io,
  Socket,
} from "socket.io-client";
import { SERVER_URL } from "./serverConfig";

let socket: Socket | null = null;

export function connectSocket(
  deviceId: string
): Socket {
  if (socket) {
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
  });

  socket.on("device-error", (data) => {
    console.error(
      `[DEVICE] ${data?.code || "ERROR"}: ${data?.message || "Device setup failed."}`
    );
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
