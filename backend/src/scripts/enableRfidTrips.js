// Explicit operator action for an existing route. No visits are fabricated.
require("dotenv").config({ quiet: true });
const { withTransaction, closeDatabase } = require("../config/database");
const { id } = require("../services/trackingValidation");

async function main() {
  const routeId = id(process.argv[2], "Route ID");
  const result = await withTransaction(async (client) => {
    const route = (await client.query("SELECT id,name,auto_enroll FROM monitoring_routes WHERE id=$1 FOR UPDATE", [routeId])).rows[0];
    if (!route) throw new Error("Route not found.");
    if (!route.auto_enroll) await client.query("UPDATE monitoring_routes SET auto_enroll=TRUE,revision=revision+1 WHERE id=$1", [routeId]);
    const groups = await client.query("SELECT id FROM tracked_groups WHERE route_id=$1", [routeId]);
    if (groups.rowCount === 1) await client.query("UPDATE tracked_groups SET auto_enroll=TRUE WHERE id=$1", [groups.rows[0].id]);
    const checkpoints = (await client.query("SELECT id,name FROM checkpoints WHERE route_id=$1 ORDER BY position,id", [routeId])).rows;
    return { routeId, routeName: route.name, autoEnroll: true, entrance: checkpoints[0], exit: checkpoints.at(-1) };
  });
  console.log(JSON.stringify(result, null, 2));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(closeDatabase);
