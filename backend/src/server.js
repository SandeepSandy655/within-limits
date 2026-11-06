require("dotenv").config();

const express = require("express");
const http = require("node:http");
const path = require("node:path");
const cors = require("cors");
const { Server } = require("socket.io");

const { pool, connectDatabase, closeDatabase } = require("./config/database");
const deviceRoutes = require("./routes/deviceRoutes");
const connectionRoutes = require("./routes/connectionRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const chatRoutes = require("./routes/chatRoutes");
const adminRoutes = require("./routes/adminRoutes");
const trackingRoutes = require("./routes/trackingRoutes");
const proximityRoutes = require("./routes/proximityRoutes");
const { getFirebaseClientConfig } = require("./controllers/authController");
const socketHandler = require("./sockets/socketHandler");
const { setIo } = require("./sockets/connectedDevices");
const requestLog = require("./middleware/requestLog");
const { corsOrigin } = require("./config/corsPolicy");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOrigin(),
    methods: ["GET", "POST"],
  },
});

app.disable('x-powered-by');
app.use(requestLog);
app.use(cors({ origin: corsOrigin() }));
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.json({ success: true, message: "Within Limits API is running" });
});

app.get("/health", (_req, res) => {
  pool.query("SELECT 1")
    .then(() => res.json({ success: true, database: "connected", apiVersion: 2, capabilities: ["group-chat"] }))
    .catch(() => res.status(503).json({ success: false, database: "disconnected" }));
});

app.get("/api/auth/config", getFirebaseClientConfig);

app.use("/admin", express.static(path.join(__dirname, "../public/admin"), {
  setHeaders(res, filePath) {
    // Always request the current entry point after an admin deployment.
    if (path.extname(filePath) === ".html") res.setHeader("Cache-Control", "no-store");
  },
}));
app.use("/api/admin", adminRoutes);
app.use("/api/tracking", trackingRoutes);
app.use("/api/proximity", proximityRoutes);
app.use("/api/devices", deviceRoutes);
app.use("/api/connections", connectionRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/chat", chatRoutes);

app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

app.use((error, _req, res, _next) => {
  const status = error.status || (error.type === "entity.parse.failed" ? 400 : 500);
  console.error(JSON.stringify({ time: new Date().toISOString(), event: 'http_error', requestId: _req.requestId, status, code: error.code || error.type || 'REQUEST_FAILED' }));
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
  // Presence belongs to this single Socket.IO process; persisted statuses cannot survive a restart.
  await pool.query(
    "UPDATE devices SET status = 'offline' WHERE status = 'online'"
  );
  
  await new Promise((resolve, reject) => {
    server.once("error", reject);
  
    server.listen(port, "0.0.0.0", () => {
      server.off("error", reject);
  
      console.log(`[server] Listening on port ${port}`);
      resolve();
    });
  });
}

async function stopServer(signal = "shutdown") {
  console.log(`[server] ${signal}; closing connections`);
  await new Promise((resolve) => io.close(resolve));
  await socketHandler.drain();
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
