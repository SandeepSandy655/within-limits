require("dotenv").config();

const express = require("express");
const http = require("node:http");
const path = require("node:path");
const cors = require("cors");
const { Server } = require("socket.io");

const { pool, connectDatabase, closeDatabase } = require("./config/database");
const deviceRoutes = require("./routes/deviceRoutes");
const connectionRoutes = require("./routes/connectionRoutes");
const adminRoutes = require("./routes/adminRoutes");
const { getFirebaseClientConfig } = require("./controllers/authController");
const socketHandler = require("./sockets/socketHandler");
const { setIo } = require("./sockets/connectedDevices");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.json({ success: true, message: "Within Limits API is running" });
});

app.get("/health", (_req, res) => {
  pool.query("SELECT 1")
    .then(() => res.json({ success: true, database: "connected" }))
    .catch(() => res.status(503).json({ success: false, database: "disconnected" }));
});

app.get("/api/auth/config", getFirebaseClientConfig);

app.use("/admin", express.static(path.join(__dirname, "../public/admin")));
app.use("/api/admin", adminRoutes);
app.use("/api/devices", deviceRoutes);
app.use("/api/connections", connectionRoutes);

app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

app.use((error, _req, res, _next) => {
  const status = error.status || (error.type === "entity.parse.failed" ? 400 : 500);
  console.error(`[http] ${status}: ${error.message}`);
  res.status(status).json({
    success: false,
    message: status === 500 ? "Internal server error" : error.message,
  });
});

setIo(io);
socketHandler(io);

const port = Number(process.env.PORT) || 5000;

async function startServer() {
  await connectDatabase();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      server.off("error", reject);
      console.log(`[server] Listening on port ${port}`);
      resolve();
    });
  });
}

async function stopServer(signal = "shutdown") {
  console.log(`[server] ${signal}; closing connections`);
  await new Promise((resolve) => io.close(resolve));
  await closeDatabase();
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(`[server] Startup failed: ${error.message}`);
    process.exitCode = 1;
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      stopServer(signal)
        .catch((error) => console.error(`[server] Shutdown failed: ${error.message}`))
        .finally(() => { process.exitCode = 0; });
    });
  }
}

module.exports = { app, server, io, startServer, stopServer };
