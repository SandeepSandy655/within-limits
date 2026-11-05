require("dotenv").config({ quiet: true });
const { randomBytes } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pool, connectDatabase, closeDatabase, withTransaction } = require("../config/database");
const { hashToken } = require("../services/proximityService");
const { text, id, InputError } = require("../services/trackingValidation");

async function main() {
  const args = process.argv.slice(2);
  const value = (key) => { const i = args.indexOf(key); return i < 0 ? undefined : args[i + 1]; };
  if (!value("--id") || (!args.includes("--revoke") && (!value("--route") || !value("--name") || !value("--output")))) throw new InputError("Usage: node src/scripts/provisionProximity.js --id ble-tag-1 --route ROUTE_UUID --name 'BLE Tag 1' --output PRIVATE_FILE [--rotate]; revoke: --id ble-tag-1 --revoke");
  const monitorId = text(value("--id"), "Monitor ID");
  await connectDatabase();
  if (args.includes("--revoke")) {
    const result = await pool.query("UPDATE proximity_monitors SET revoked_at=NOW(),member_id=NULL,assigned_at=NULL WHERE id=$1 RETURNING id", [monitorId]);
    if (!result.rowCount) throw new InputError("Monitor not found.");
    console.log("Proximity credential revoked."); return;
  }
  const routeId = id(value("--route"), "Route ID"), name = text(value("--name"), "Monitor name");
  const token = randomBytes(32).toString("base64url"), output = path.resolve(value("--output"));
  const file = await fs.open(output, "wx", 0o600);
  try {
    await withTransaction(async (client) => {
      if (!(await client.query("SELECT id FROM monitoring_routes WHERE id=$1 FOR SHARE", [routeId])).rowCount) throw new InputError("Route not found.");
      if (args.includes("--rotate")) {
        if (!(await client.query("UPDATE proximity_monitors SET token_hash=$2,revoked_at=NULL,name=$3 WHERE id=$1 AND route_id=$4 RETURNING id", [monitorId, hashToken(token), name, routeId])).rowCount) throw new InputError("Monitor not found on this route.");
      } else {
        await client.query("INSERT INTO proximity_monitors(id,route_id,name,token_hash) VALUES ($1,$2,$3,$4)", [monitorId, routeId, name, hashToken(token)]);
      }
      await file.writeFile(JSON.stringify({ monitorId, routeId, name, token, endpoint: "/api/proximity/reports" }, null, 2) + "\n");
      await file.sync();
    });
    console.log(`Credential saved to ${output}. Token not printed.`);
  } catch (error) {
    await file.close(); await fs.unlink(output);
    if (error.code === "23505") throw new InputError("Monitor exists. Rotate with a new output filename if needed.");
    throw error;
  } finally { await file.close().catch(() => {}); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(closeDatabase);
