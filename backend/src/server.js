require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const connectDatabase = require("./config/database");

const deviceRoutes = require("./routes/deviceRoutes");
const connectionRoutes = require("./routes/connectionRoutes");
const socketHandler = require("./sockets/socketHandler");
const { setIo } = require("./sockets/connectedDevices");


const app = express();

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Backend is running"
  });
});

app.use("/api/devices", deviceRoutes);
app.use("/api/connections", connectionRoutes);

app.set("io", io);
setIo(io);

socketHandler(io);

const PORT = process.env.PORT || 5000;

async function startServer() {
  await connectDatabase();

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();