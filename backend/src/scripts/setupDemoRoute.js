// Explicit local demo setup. Does not alter hardware assignments or recorded trips.
require("dotenv").config({ quiet: true });
const { randomUUID } = require("node:crypto");
const { withTransaction, closeDatabase } = require("../config/database");
const { id } = require("../services/trackingValidation");

async function main() {
  const sourceRouteId = id(process.argv[2], "Existing route ID");
  const result = await withTransaction(async (client) => {
    const source = (await client.query("SELECT owner_uid FROM monitoring_routes WHERE id=$1", [sourceRouteId])).rows[0];
    if (!source) throw new Error("Choose an existing route to identify the demo's admin owner.");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`four-point-demo:${source.owner_uid}`]);
    const existing = await client.query("SELECT id FROM monitoring_routes WHERE owner_uid=$1 AND name=$2 AND region=$3", [source.owner_uid, "Four-point demo route", "Demo · example map"]);
    if (existing.rowCount > 1) throw new Error("Multiple demo routes found; choose one in the admin page.");
    if (existing.rowCount) return { existing: true, routeId: existing.rows[0].id };
    const routeId = randomUUID(), groupId = randomUUID();
    // Illustrative park coordinates form three legs with turns, not a surveyed route.
    const points = [
      ["Entrance", 12.9762, 77.5906], ["Garden", 12.9774, 77.5911],
      ["Pavilion", 12.9768, 77.5924], ["Exit", 12.9757, 77.5916],
    ];
    await client.query("INSERT INTO monitoring_routes (id,owner_uid,name,region,path) VALUES ($1,$2,$3,$4,$5::jsonb)", [routeId, source.owner_uid, "Four-point demo route", "Demo · example map", JSON.stringify(points.map(([, lat, lng]) => [lat, lng]))]);
    for (const [position, [name, latitude, longitude]] of points.entries()) {
      await client.query("INSERT INTO checkpoints(id,route_id,name,position,latitude,longitude) VALUES ($1,$2,$3,$4,$5,$6)", [randomUUID(), routeId, name, position, latitude, longitude]);
    }
    await client.query("INSERT INTO tracked_groups(id,route_id,name,leader_name) VALUES ($1,$2,$3,$4)", [groupId, routeId, "Demo test group", "Demo member 1"]);
    for (let index = 1; index <= 4; index++) {
      await client.query("INSERT INTO tracking_members(id,group_id,name,tag_id) VALUES ($1,$2,$3,$4)", [randomUUID(), groupId, `Demo member ${index}`, `DEMO-${groupId}-${index}`]);
    }
    return { existing: false, routeId, groupId, checkpoints: points.map(([name]) => name) };
  });
  console.log(JSON.stringify({ ...result, note: "Example route only. No checkpoint visits or proximity reports were simulated." }, null, 2));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(closeDatabase);
