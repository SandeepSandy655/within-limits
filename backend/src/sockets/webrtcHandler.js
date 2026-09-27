const Connection = require("../models/Connection");

async function areDevicesConnected(
  requesterId,
  receiverId
) {
  const connection = await Connection.findOne({
    status: "accepted",
    $or: [
      {
        requesterId,
        receiverId
      },
      {
        requesterId: receiverId,
        receiverId: requesterId
      }
    ]
  });

  return !!connection;
}

function webrtcHandler(io) {
  // deviceId -> socketId
  const connectedDevices = new Map();

  io.on("connection", (socket) => {
    console.log(
      `[WEBRTC] Socket connected: ${socket.id}`
    );

    // --------------------------------------------------
    // Register this socket with a device
    // --------------------------------------------------

    socket.on("webrtc-register", (data) => {
      try {
        const { deviceId } = data || {};

        if (!deviceId) {
          socket.emit("webrtc-error", {
            message: "deviceId is required"
          });

          return;
        }

        socket.deviceId = deviceId;

        connectedDevices.set(
          deviceId,
          socket.id
        );

        console.log(
          `[WEBRTC] Device registered: ${deviceId}`
        );

      } catch (error) {
        console.error(
          "[WEBRTC] Register error:",
          error
        );
      }
    });

    // --------------------------------------------------
    // SEND OFFER
    // --------------------------------------------------

    socket.on("webrtc-offer", async (data) => {
      try {
        const {
          from,
          to,
          offer
        } = data || {};

        if (!from || !to || !offer) {
          socket.emit("webrtc-error", {
            message:
              "from, to and offer are required"
          });

          return;
        }

        const connected =
          await areDevicesConnected(
            from,
            to
          );

        if (!connected) {
          socket.emit("webrtc-error", {
            message:
              "Devices do not have an accepted connection"
          });

          return;
        }

        const targetSocketId =
          connectedDevices.get(to);

        if (!targetSocketId) {
          socket.emit("webrtc-error", {
            message:
              "Target device is not online"
          });

          return;
        }

        io.to(targetSocketId).emit(
          "webrtc-offer",
          {
            from,
            to,
            offer
          }
        );

        console.log(
          `[WEBRTC] OFFER: ${from} → ${to}`
        );

      } catch (error) {
        console.error(
          "[WEBRTC] Offer error:",
          error
        );
      }
    });

    // --------------------------------------------------
    // SEND ANSWER
    // --------------------------------------------------

    socket.on("webrtc-answer", async (data) => {
      try {
        const {
          from,
          to,
          answer
        } = data || {};

        if (!from || !to || !answer) {
          socket.emit("webrtc-error", {
            message:
              "from, to and answer are required"
          });

          return;
        }

        const connected =
          await areDevicesConnected(
            from,
            to
          );

        if (!connected) {
          socket.emit("webrtc-error", {
            message:
              "Devices do not have an accepted connection"
          });

          return;
        }

        const targetSocketId =
          connectedDevices.get(to);

        if (!targetSocketId) {
          socket.emit("webrtc-error", {
            message:
              "Target device is not online"
          });

          return;
        }

        io.to(targetSocketId).emit(
          "webrtc-answer",
          {
            from,
            to,
            answer
          }
        );

        console.log(
          `[WEBRTC] ANSWER: ${from} → ${to}`
        );

      } catch (error) {
        console.error(
          "[WEBRTC] Answer error:",
          error
        );
      }
    });

    // --------------------------------------------------
    // SEND ICE CANDIDATE
    // --------------------------------------------------

    socket.on(
      "webrtc-ice-candidate",
      async (data) => {
        try {
          const {
            from,
            to,
            candidate
          } = data || {};

          if (
            !from ||
            !to ||
            !candidate
          ) {
            socket.emit("webrtc-error", {
              message:
                "from, to and candidate are required"
            });

            return;
          }

          const connected =
            await areDevicesConnected(
              from,
              to
            );

          if (!connected) {
            socket.emit("webrtc-error", {
              message:
                "Devices do not have an accepted connection"
            });

            return;
          }

          const targetSocketId =
            connectedDevices.get(to);

          if (!targetSocketId) {
            socket.emit("webrtc-error", {
              message:
                "Target device is not online"
            });

            return;
          }

          io.to(targetSocketId).emit(
            "webrtc-ice-candidate",
            {
              from,
              to,
              candidate
            }
          );

          console.log(
            `[WEBRTC] ICE: ${from} → ${to}`
          );

        } catch (error) {
          console.error(
            "[WEBRTC] ICE error:",
            error
          );
        }
      }
    );

    // --------------------------------------------------
    // DISCONNECT
    // --------------------------------------------------

    socket.on("disconnect", () => {
      const deviceId = socket.deviceId;

      if (
        deviceId &&
        connectedDevices.get(deviceId) ===
          socket.id
      ) {
        connectedDevices.delete(
          deviceId
        );

        console.log(
          `[WEBRTC] Device disconnected: ${deviceId}`
        );
      }
    });
  });
}

module.exports = webrtcHandler;