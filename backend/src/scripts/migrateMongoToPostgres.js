const path = require("node:path");
const dotenv = require("dotenv");
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const { randomBytes } = require("node:crypto");
const { MongoClient } = require("mongodb");
const { pool, connectDatabase, withTransaction, closeDatabase } = require("../config/database");

const BATCH_SIZE = 200;
const apply = process.argv.includes("--apply");

function idString(value) {
  return value?.toString?.() || randomBytes(12).toString("hex");
}

function validDate(value, fallback = new Date()) {
  const date = value ? new Date(value) : fallback;
  return Number.isNaN(date.getTime()) ? fallback : date;
}

async function insertBatch(table, columns, rows, jsonColumns, conflictSql) {
  if (!rows.length) return;
  const values = [];
  const tuples = rows.map((row, rowIndex) => {
    const placeholders = columns.map((column, columnIndex) => {
      values.push(row[columnIndex]);
      const placeholder = `$${rowIndex * columns.length + columnIndex + 1}`;
      return jsonColumns.has(column) ? `${placeholder}::jsonb` : placeholder;
    });
    return `(${placeholders.join(", ")})`;
  });

  const sql = `INSERT INTO ${table} (${columns.join(", ")})
    VALUES ${tuples.join(", ")}
    ${conflictSql}`;
  await withTransaction((client) => client.query(sql, values));
}

async function transferCollection(collection, table, columns, transform, jsonColumns, conflictSql) {
  let copied = 0;
  let batch = [];
  const cursor = collection.find({}).sort({ _id: 1 }).batchSize(BATCH_SIZE);

  for await (const document of cursor) {
    batch.push(transform(document));
    if (batch.length >= BATCH_SIZE) {
      await insertBatch(table, columns, batch, jsonColumns, conflictSql);
      copied += batch.length;
      batch = [];
      console.log(`[migration] ${table}: copied ${copied}`);
    }
  }

  if (batch.length) {
    await insertBatch(table, columns, batch, jsonColumns, conflictSql);
    copied += batch.length;
  }
  return copied;
}

async function preflight(database, devicesCount, connectionsCount, locationsCount) {
  const deviceIds = new Set();
  for await (const device of database.collection("devices").find({}, { projection: { deviceId: 1 } })) {
    if (device.deviceId) deviceIds.add(device.deviceId);
  }

  let invalidConnections = 0;
  for await (const connection of database.collection("connections").find({}, { projection: { requesterId: 1, receiverId: 1 } })) {
    if (!deviceIds.has(connection.requesterId) || !deviceIds.has(connection.receiverId)) invalidConnections += 1;
  }

  let invalidLocations = 0;
  const orphanLocationCounts = new Map();
  for await (const location of database.collection("locations").find({}, { projection: { deviceId: 1 } })) {
    if (!deviceIds.has(location.deviceId)) {
      invalidLocations += 1;
      const orphanId = location.deviceId == null ? "(missing)" : String(location.deviceId);
      orphanLocationCounts.set(orphanId, (orphanLocationCounts.get(orphanId) || 0) + 1);
    }
  }

  console.log(`[migration] Source documents: devices=${devicesCount}, connections=${connectionsCount}, locations=${locationsCount}`);
  console.log(`[migration] Reference check: invalid connections=${invalidConnections}, orphan locations=${invalidLocations}`);
  if (orphanLocationCounts.size) {
    const examples = [...orphanLocationCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([deviceId, count]) => `${deviceId} (${count})`)
      .join(", ");
    console.log(`[migration] Orphan location device IDs (up to 10): ${examples}`);
  }
  if (invalidConnections || invalidLocations) {
    throw new Error("Preflight found records without a registered device. Resolve those references before importing; MongoDB has not been changed.");
  }
}

async function targetCounts() {
  const result = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM devices) AS devices,
      (SELECT COUNT(*)::int FROM connections) AS connections,
      (SELECT COUNT(*)::int FROM locations) AS locations
  `);
  return result.rows[0];
}

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is required in backend/.env for the copy migration.");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for the PostgreSQL target.");

  const mongo = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 10_000 });
  try {
    await mongo.connect();
    const source = mongo.db();
    const collections = {
      devices: source.collection("devices"),
      connections: source.collection("connections"),
      locations: source.collection("locations"),
    };
    const counts = {
      devices: await collections.devices.countDocuments(),
      connections: await collections.connections.countDocuments(),
      locations: await collections.locations.countDocuments(),
    };

    await connectDatabase();
    await preflight(source, counts.devices, counts.connections, counts.locations);
    console.log(`[migration] PostgreSQL rows before copy: ${JSON.stringify(await targetCounts())}`);

    if (!apply) {
      console.log("[migration] Dry run only. Review the counts, back up both databases, then rerun with --apply to copy data.");
      return;
    }

    const copiedDevices = await transferCollection(
      collections.devices,
      "devices",
      ["id", "device_id", "connection_code", "owner_id", "device_name", "device_type", "platform", "status", "location", "last_seen", "created_at", "updated_at"],
      (document) => [
        idString(document._id),
        document.deviceId,
        document.connectionCode || null,
        document.ownerId || null,
        document.deviceName || "Unknown Device",
        document.deviceType || "mobile",
        document.platform || "unknown",
        ["online", "offline"].includes(document.status) ? document.status : "offline",
        document.location == null ? null : JSON.stringify(document.location),
        document.lastSeen || null,
        validDate(document.createdAt, document._id?.getTimestamp?.() || new Date()),
        validDate(document.updatedAt, document.createdAt || new Date()),
      ],
      new Set(["location"]),
      `ON CONFLICT (device_id) DO UPDATE SET
        id = EXCLUDED.id,
        connection_code = EXCLUDED.connection_code,
        owner_id = EXCLUDED.owner_id,
        device_name = EXCLUDED.device_name,
        device_type = EXCLUDED.device_type,
        platform = EXCLUDED.platform,
        status = EXCLUDED.status,
        location = EXCLUDED.location,
        last_seen = EXCLUDED.last_seen,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at`
    );

    const copiedConnections = await transferCollection(
      collections.connections,
      "connections",
      ["id", "requester_id", "receiver_id", "status", "created_at", "accepted_at"],
      (document) => [
        idString(document._id),
        document.requesterId,
        document.receiverId,
        ["pending", "accepted", "rejected", "blocked"].includes(document.status) ? document.status : "pending",
        validDate(document.createdAt, new Date()),
        document.acceptedAt || null,
      ],
      new Set(),
      `ON CONFLICT (id) DO UPDATE SET
        requester_id = EXCLUDED.requester_id,
        receiver_id = EXCLUDED.receiver_id,
        status = EXCLUDED.status,
        created_at = EXCLUDED.created_at,
        accepted_at = EXCLUDED.accepted_at`
    );

    const copiedLocations = await transferCollection(
      collections.locations,
      "locations",
      ["id", "device_id", "location", "accuracy", "speed", "heading", "timestamp"],
      (document) => [
        idString(document._id),
        document.deviceId,
        JSON.stringify(document.location),
        Number.isFinite(document.accuracy) ? document.accuracy : null,
        Number.isFinite(document.speed) ? document.speed : null,
        Number.isFinite(document.heading) ? document.heading : null,
        validDate(document.timestamp, new Date()),
      ],
      new Set(["location"]),
      `ON CONFLICT (id) DO UPDATE SET
        device_id = EXCLUDED.device_id,
        location = EXCLUDED.location,
        accuracy = EXCLUDED.accuracy,
        speed = EXCLUDED.speed,
        heading = EXCLUDED.heading,
        timestamp = EXCLUDED.timestamp`
    );

    const after = await targetCounts();
    console.log(`[migration] Copied/upserted: devices=${copiedDevices}, connections=${copiedConnections}, locations=${copiedLocations}`);
    console.log(`[migration] PostgreSQL rows after copy: ${JSON.stringify(after)}`);
    console.log("[migration] MongoDB source was read-only and has not been deleted or modified.");
  } finally {
    await mongo.close();
    await closeDatabase();
  }
}

main().catch((error) => {
  console.error(`[migration] Failed: ${error.message}`);
  process.exitCode = 1;
});
