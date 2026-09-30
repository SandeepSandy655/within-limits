const connectionService = require("../services/connectionService");
const { getDeviceSocket } = require("./connectedDevices");

const SIGNAL_EVENTS = [
  ["webrtc-offer", "offer"],
  ["webrtc-answer", "answer"],
  ["webrtc-ice-candidate", "candidate"],
];

function registerWebRtcHandlers(io, socket) {
  for (const [eventName, payloadKey] of SIGNAL_EVENTS) {
    socket.on(eventName, async (data = {}) => {
      data = data && typeof data === "object" ? data : {};
      const { from, to } = data;

      if (!socket.deviceId || from !== socket.deviceId || !to || data[payloadKey] === undefined) {
        socket.emit("webrtc-error", {
          message: "The signaling sender, recipient, or payload is invalid.",
        });
        return;
      }

      try {
        const allowed = await connectionService.areDevicesPaired(from, to);
        if (!allowed) {
          socket.emit("webrtc-error", { message: "Devices are not connected." });
          return;
        }

        const targetSocketId = getDeviceSocket(to);
        if (!targetSocketId) {
          socket.emit("webrtc-error", { message: "Target device is offline." });
          return;
        }

        io.to(targetSocketId).emit(eventName, {
          from,
          to,
          [payloadKey]: data[payloadKey],
        });
      } catch (error) {
        console.error(`[socket:${eventName}] ${error.message}`);
        socket.emit("webrtc-error", { message: "Unable to relay signaling data." });
      }
    });
  }
}

module.exports = registerWebRtcHandlers;
