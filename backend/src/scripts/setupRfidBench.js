// Explicit local bench setup; never called by server startup.
require("dotenv").config({ quiet: true });
const { randomUUID } = require("node:crypto");
const { getFirebaseAdminAuth } = require("../config/firebaseAdmin");
const { pool, withTransaction, closeDatabase } = require("../config/database");

async function main() {
  if (!process.argv.includes("--placeholder-map")) throw new Error("Pass --placeholder-map to acknowledge that the bench route uses example map coordinates, not actual checkpoint locations.");
  const auth = getFirebaseAdminAuth();
  let owner;
  if (process.env.ADMIN_USER_EMAIL) {
    owner = await auth.getUserByEmail(process.env.ADMIN_USER_EMAIL);
  } else {
    const page = await auth.listUsers(100);
    const admins = page.users.filter((user) => !user.disabled && ["group_admin", "super_admin"].includes(user.customClaims?.adminRole));
    if (page.pageToken || admins.length !== 1) throw new Error("Cannot choose an unambiguous admin owner. Set ADMIN_USER_EMAIL to the intended existing admin account.");
    owner = admins[0];
  }
  if (owner.disabled || !["group_admin", "super_admin"].includes(owner.customClaims?.adminRole)) throw new Error("The selected account does not have active admin access.");
  const result = await withTransaction(async (client) => {
    // Serialize only this bench setup, including duplicate invocations.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('within-limits-rfid-bench'))");
    const assignment = await client.query(`SELECT m.name, m.active, g.id AS group_id, r.id AS route_id, r.owner_uid, r.name AS route_name
      FROM tracking_members m JOIN tracked_groups g ON g.id = m.group_id JOIN monitoring_routes r ON r.id = g.route_id WHERE m.tag_id = $1`, ["A9181D06"]);
    if (assignment.rowCount) {
      const current = assignment.rows[0];
      if (current.owner_uid !== owner.uid || current.name !== "Person 1" || !current.active) throw new Error("Card A9181D06 is already assigned differently; existing assignment was preserved.");
      const entrance = await client.query("SELECT id FROM checkpoints WHERE route_id = $1 AND name = 'Entrance'", [current.route_id]);
      if (entrance.rowCount !== 1) throw new Error("Existing card route needs one unambiguous Entrance checkpoint.");
      return { existing: true, routeId: current.route_id, groupId: current.group_id, checkpointId: entrance.rows[0].id, routeName: current.route_name };
    }
    // Zero-based example coordinates deliberately avoid claiming a real site.
    const routeId = randomUUID(), entranceId = randomUUID(), exitId = randomUUID(), groupId = randomUUID();
    await client.query("INSERT INTO monitoring_routes (id, owner_uid, name, region, path) VALUES ($1,$2,$3,$4,$5::jsonb)", [routeId, owner.uid, "RFID test route", "Bench test - placeholder map", JSON.stringify([[0, 0], [0, 0.001]])]);
    await client.query("INSERT INTO checkpoints (id, route_id, name, position, latitude, longitude) VALUES ($1,$2,'Entrance',0,0,0),($3,$2,'Exit',1,0,0.001)", [entranceId, routeId, exitId]);
    await client.query("INSERT INTO tracked_groups (id, route_id, name, leader_name) VALUES ($1,$2,'RFID test group','Person 1')", [groupId, routeId]);
    await client.query("INSERT INTO tracking_members (id, group_id, name, tag_id) VALUES ($1,$2,'Person 1','A9181D06')", [randomUUID(), groupId]);
    return { existing: false, routeId, groupId, checkpointId: entranceId, routeName: "RFID test route" };
  });
  console.log(JSON.stringify({ ...result, memberName: "Person 1", tagId: "A9181D06", readerCheckpoint: "Entrance", note: "Bench map positions are placeholders; no card observation has been inserted." }, null, 2));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(closeDatabase);
