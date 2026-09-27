const deviceService = require("../services/deviceService");
const connectionService = require("../services/connectionService");
const {
  setDeviceSocket,
  removeDeviceSocket,
  getDeviceSocket
} = require("./connectedDevices");

function socketHandler(io) {
  io.on("connection", (socket) => {
    console.log("");
    console.log("=================================");
    console.log("NEW SOCKET CONNECTION");
    console.log("Socket ID:", socket.id);
    console.log("=================================");

    // =========================================
    // DEVICE ONLINE
    // =========================================

    socket.on("device-online", async (data) => {
      try {
        const { deviceId } = data || {};

        if (!deviceId) {
          return;
        }

        socket.deviceId = deviceId;

        setDeviceSocket(deviceId, socket.id);

        await deviceService.updateDeviceStatus(
          deviceId,
          "online"
        );

        console.log(
          `DEVICE ONLINE: ${deviceId}`
        );

        io.emit("device-status", {
          deviceId,
          status: "online"
        });
      } catch (error) {
        console.error(
          "DEVICE ONLINE ERROR:",
          error
        );
      }
    });

    // =========================================
    // LIVE LOCATION
    // =========================================

    socket.on("device-location", async (data) => {
      try {
        const {
          deviceId,
          latitude,
          longitude,
          accuracy,
          speed,
          heading
        } = data;

        if (!deviceId) {
          return;
        }

        if (
          typeof latitude !== "number" ||
          latitude < -90 ||
          latitude > 90
        ) {
          return;
        }

        if (
          typeof longitude !== "number" ||
          longitude < -180 ||
          longitude > 180
        ) {
          return;
        }

        await deviceService.updateDeviceLocation(
          deviceId,
          latitude,
          longitude,
          accuracy
        );

        await deviceService.saveLocationHistory(
          deviceId,
          latitude,
          longitude,
          accuracy,
          speed,
          heading
        );

        io.emit("device-location", {
          deviceId,
          latitude,
          longitude,
          accuracy: accuracy || null,
          speed: speed || null,
          heading: heading || null
        });
      } catch (error) {
        console.error(
          "LOCATION UPDATE ERROR:",
          error
        );
      }
    });

    // =========================================
    // WEBRTC DEVICE REGISTRATION
    // =========================================

    socket.on("webrtc-register", (data) => {
      const { deviceId } = data || {};

      if (!deviceId) {
        return;
      }

      socket.deviceId = deviceId;

      setDeviceSocket(deviceId, socket.id);

      console.log(
        `[WEBRTC] Registered: ${deviceId}`
      );
    });

    // =========================================
    // SEND CONNECTION REQUEST
    // =========================================

    socket.on(
      "send-connection-request",
      async (data) => {
        try {
          const {
            requesterId,
            receiverId
          } = data || {};

          const connection =
            await connectionService.sendConnectionRequest(
              requesterId,
              receiverId
            );

          const receiverSocket =
            getDeviceSocket(receiverId);

          if (receiverSocket) {
            io.to(receiverSocket).emit(
              "connection-request",
              {
                connection
              }
            );
          }

          socket.emit(
            "connection-request-sent",
            {
              connection
            }
          );

          console.log(
            `[CONNECTION] ${requesterId} → ${receiverId}`
          );
        } catch (error) {
          socket.emit(
            "connection-error",
            {
              message: error.message
            }
          );
        }
      }
    );

    // =========================================
    // ACCEPT CONNECTION
    // =========================================

    socket.on(
      "accept-connection",
      async (data) => {
        try {
          const {
            connectionId
          } = data || {};

          const connection =
            await connectionService.acceptConnection(
              connectionId
            );

          const requesterSocket =
            getDeviceSocket(
              connection.requesterId
            );

          if (requesterSocket) {
            io.to(requesterSocket).emit(
              "connection-accepted",
              {
                connection
              }
            );
          }

          socket.emit(
            "connection-accepted",
            {
              connection
            }
          );

          console.log(
            `[CONNECTION ACCEPTED] ${connection.requesterId} ↔ ${connection.receiverId}`
          );
        } catch (error) {
          socket.emit(
            "connection-error",
            {
              message: error.message
            }
          );
        }
      }
    );

    // =========================================
    // REJECT CONNECTION
    // =========================================

    socket.on(
      "reject-connection",
      async (data) => {
        try {
          const {
            connectionId
          } = data || {};

          const connection =
            await connectionService.rejectConnection(
              connectionId
            );

          const requesterSocket =
            getDeviceSocket(
              connection.requesterId
            );

          if (requesterSocket) {
            io.to(requesterSocket).emit(
              "connection-rejected",
              {
                connection
              }
            );
          }

          socket.emit(
            "connection-rejected",
            {
              connection
            }
          );

          console.log(
            `[CONNECTION REJECTED] ${connection.requesterId} → ${connection.receiverId}`
          );
        } catch (error) {
          socket.emit(
            "connection-error",
            {
              message: error.message
            }
          );
        }
      }
    );

    // =========================================
    // WEBRTC OFFER
    // =========================================

    socket.on("webrtc-offer", async (data) => {
      try {
        const {
          from,
          to,
          offer
        } = data || {};

        const allowed =
          await connectionService.areDevicesPaired(
            from,
            to
          );

        if (!allowed) {
          socket.emit("webrtc-error", {
            message:
              "Devices are not connected"
          });

          return;
        }

        const targetSocket =
          getDeviceSocket(to);

        if (!targetSocket) {
          socket.emit("webrtc-error", {
            message:
              "Target device is offline"
          });

          return;
        }

        io.to(targetSocket).emit(
          "webrtc-offer",
          {
            from,
            to,
            offer
          }
        );
      } catch (error) {
        console.error(
          "WebRTC offer error:",
          error
        );
      }
    });

    // =========================================
    // WEBRTC ANSWER
    // =========================================

    socket.on(
      "webrtc-answer",
      async (data) => {
        try {
          const {
            from,
            to,
            answer
          } = data || {};

          const targetSocket =
            getDeviceSocket(to);

          if (!targetSocket) {
            return;
          }

          io.to(targetSocket).emit(
            "webrtc-answer",
            {
              from,
              to,
              answer
            }
          );
        } catch (error) {
          console.error(
            "WebRTC answer error:",
            error
          );
        }
      }
    );

    // =========================================
    // WEBRTC ICE
    // =========================================

    socket.on(
      "webrtc-ice-candidate",
      async (data) => {
        try {
          const {
            from,
            to,
            candidate
          } = data || {};

          const targetSocket =
            getDeviceSocket(to);

          if (!targetSocket) {
            return;
          }

          io.to(targetSocket).emit(
            "webrtc-ice-candidate",
            {
              from,
              to,
              candidate
            }
          );
        } catch (error) {
          console.error(
            "WebRTC ICE error:",
            error
          );
        }
      }
    );

    // =========================================
    // DISCONNECT
    // =========================================

    socket.on("disconnect", async (reason) => {
      const deviceId =
        socket.deviceId;

      console.log(
        `Device disconnected: ${deviceId}`
      );

      if (!deviceId) {
        return;
      }

      try {
        if (getDeviceSocket(deviceId) === socket.id) {
          removeDeviceSocket(deviceId, socket.id);

          await deviceService.updateDeviceStatus(
            deviceId,
            "offline"
          );

          io.emit("device-status", {
            deviceId,
            status: "offline"
          });
        }
      } catch (error) {
        console.error(
          "DISCONNECT ERROR:",
          error
        );
      }
    });
  });
}

module.exports = socketHandler;