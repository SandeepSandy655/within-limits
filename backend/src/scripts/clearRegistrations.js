// Explicit operator reset. Always writes a backup before removing registered data.
require("dotenv").config({ quiet: true });
const { mkdir, writeFile } = require("node:fs/promises");
const path = require("node:path");
const { pool, closeDatabase } = require("../config/database");
const { clearRegistrations } = require("../services/registrationReset");
const { id } = require("../services/trackingValidation");

async function main() {
  const target = process.argv[2];
  if (!target || !process.argv.includes("--confirm")) throw new Error("Usage: node src/scripts/clearRegistrations.js <route-id|--all> --confirm");
  const routes = (await pool.query(`SELECT id,name FROM monitoring_routes ${target === "--all" ? "" : "WHERE id=$1"} ORDER BY id`, target === "--all" ? [] : [id(target, "Route ID")])).rows;
  if (!routes.length) throw new Error("No routes found.");
  const backupDir = path.resolve(process.env.REGISTRATION_BACKUP_DIR || ".private/registration-backups");
  await mkdir(backupDir, { recursive: true });
  for (const route of routes) {
    const backupFile = path.join(backupDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${route.id}.json`);
    const result = await clearRegistrations(route.id, { role: "super_admin", uid: "local-operator" }, route.name, async (client, lockedRoute) => {
      const snapshot = { version: 1, backedUpAt: new Date().toISOString(), route: lockedRoute };
      const queries = {
        groups: "SELECT * FROM tracked_groups WHERE route_id=$1",
        members: "SELECT m.* FROM tracking_members m JOIN tracked_groups g ON g.id=m.group_id WHERE g.route_id=$1",
        checkpointReports: "SELECT * FROM checkpoint_reports WHERE route_id=$1",
        proximityReports: "SELECT p.* FROM proximity_reports p JOIN proximity_monitors m ON m.id=p.monitor_id WHERE m.route_id=$1",
        assignments: "SELECT id,member_id,assigned_at,out_of_range_since,reports_cleared_at FROM proximity_monitors WHERE route_id=$1",
      };
      for (const [key, sql] of Object.entries(queries)) snapshot[key] = (await client.query(sql, [route.id])).rows;
      await writeFile(backupFile, JSON.stringify(snapshot, null, 2), { flag: "wx", mode: 0o600 });
    });
    console.log(JSON.stringify({ ...result, backupFile }));
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(closeDatabase);
