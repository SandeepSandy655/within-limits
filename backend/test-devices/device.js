const { io } = require("socket.io-client");

const deviceId = process.argv[2];

if (!deviceId) {
  console.log(
    "Usage: node test-devices/device.js DEVICE_ID"
  );

  process.exit(1);
}

const socket = io(
  "http://localhost:5000",
  {
    reconnection: false
  }
);


socket.on("connect", () => {

  console.log("");
  console.log("=================================");
  console.log("DEVICE CONNECTED");
  console.log("Device ID:", deviceId);
  console.log("Socket ID:", socket.id);
  console.log("=================================");
  console.log("");

  socket.emit(
    "device-online",
    {
      deviceId
    }
  );

  startLocationSimulation();
});


socket.on("device-status", (data) => {

  console.log(
    `[STATUS] ${data.deviceId} → ${data.status}`
  );

});


socket.on("device-location", (data) => {

  if (data.deviceId !== deviceId) {

    console.log(
      `[REMOTE LOCATION] ${data.deviceId} →`,
      `${data.latitude}, ${data.longitude}`
    );

  }

});


socket.on("disconnect", (reason) => {

  console.log("");

  console.log(
    `Device ${deviceId} disconnected`
  );

  console.log(
    "Reason:",
    reason
  );

});


socket.on("connect_error", (error) => {

  console.log(
    "Connection error:",
    error.message
  );

});


function startLocationSimulation() {

  let latitude = 12.9625;
  let longitude = 78.2792;

  console.log(
    "Starting location simulation..."
  );

  sendLocation(
    latitude,
    longitude
  );

  setInterval(() => {

    latitude += 0.0001;
    longitude += 0.0001;

    sendLocation(
      latitude,
      longitude
    );

  }, 5000);
}


function sendLocation(
  latitude,
  longitude
) {

  console.log("");

  console.log(
    `[MY LOCATION] ${latitude}, ${longitude}`
  );

  socket.emit(
    "device-location",
    {
      deviceId,
      latitude,
      longitude,
      accuracy: 10
    }
  );
}