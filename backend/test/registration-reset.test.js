const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, randomBytes } = require("node:crypto");
const { Pool } = require("pg");

test("registration reset: ownership, confirmation, history cleanup and fresh re-enrollment", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const schema = `reset_test_${randomBytes(8).toString("hex")}`;
  const setup = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const url = new URL(process.env.TEST_DATABASE_URL); url.searchParams.set("options", `-c search_path=${schema}`); process.env.DATABASE_URL = url.toString();
  const db = require("../src/config/database");
  let server;
  try {
    await setup.query(`CREATE SCHEMA ${schema}`); await db.connectDatabase();
    const tracking = require("../src/services/trackingService");
    const proximity = require("../src/services/proximityService");
    const { registrationSummary, clearRegistrations } = require("../src/services/registrationReset");
    const admin = { uid: "one", role: "group_admin" }, other = { uid: "two", role: "group_admin" };
    const routeBody = { name: "Reset trail", region: "Test", autoEnroll: true, path: [[0,0],[0,1]], checkpoints: [{ name: "Entrance", latitude: 0, longitude: 0 }, { name: "Exit", latitude: 0, longitude: 1 }] };
    const routeId = await tracking.saveRoute(routeBody, null, admin);
    const otherRoute = await tracking.saveRoute({ ...routeBody, name: "Other trail" }, null, other);
    await tracking.createGroup({ name: "Keep", leaderName: "Other", routeId: otherRoute, members: [{ name: "Other", tagId: "other-card" }] }, other);
    await db.pool.query("INSERT INTO devices(id,device_id) VALUES ('mobile','mobile')");
    const checkpoints = (await tracking.getOverview(admin)).routes[0].checkpoints;
    const keys = [randomBytes(32).toString("hex"), randomBytes(32).toString("hex")];
    for (let i = 0; i < 2; i++) await db.pool.query("INSERT INTO checkpoint_reporters(id,checkpoint_id,token_hash) VALUES ($1,$2,$3)", [`reader-${i}`, checkpoints[i].id, tracking.hashToken(keys[i])]);
    const event = (tagId, extra = {}) => ({ eventId: randomUUID(), tagId, observedAt: new Date().toISOString(), ...extra });
    const oldScan = event("card-a");
    await tracking.receiveReport(keys[0], oldScan);
    await tracking.receiveReport(keys[1], event("card-a"));
    await tracking.receiveReport(keys[0], event("card-b"));
    const member = (await tracking.getOverview(admin)).groups[0].members[0];
    const boardKey = randomBytes(32).toString("hex");
    await db.pool.query("INSERT INTO proximity_monitors(id,route_id,name,token_hash) VALUES ('board',$1,'Device',$2)", [routeId, proximity.hashToken(boardKey)]);
    await proximity.assignProximity("board", member.id, admin);
    const oldReport = { ...event("WL-AABBCCDDEEFF"), state: "far", rssi: -90, buzzerEnabled: true };
    await proximity.receiveProximity(boardKey, oldReport);
    const before = await registrationSummary(routeId, admin);
    assert.equal(before.cards, 2); assert.equal(before.completedTrips, 1); assert.equal(before.checkpointVisits, 3);
    await assert.rejects(registrationSummary(routeId, other), { status: 404 });
    await assert.rejects(clearRegistrations(routeId, other, routeBody.name), { status: 404 });
    await assert.rejects(clearRegistrations(routeId, admin, "wrong route"), { status: 400 });
    await assert.rejects(clearRegistrations(routeId, admin, routeBody.name, async () => { throw new Error("Backup failed"); }), /Backup failed/);
    assert.equal((await registrationSummary(routeId, admin)).cards, 2);

    const express = require("express"), app = express(); app.use(express.json()); app.use("/api/admin", require("../src/routes/adminRoutes"));
    server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
    const denied = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/routes/${routeId}/registrations`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmRouteName: routeBody.name }) });
    assert.equal(denied.status, 401);

    const cleared = await clearRegistrations(routeId, admin, routeBody.name);
    assert.equal(cleared.deleted.cards, 2); assert.equal(cleared.deleted.proximityReports, 1);
    const after = await registrationSummary(routeId, admin);
    for (const field of ["cards", "registrations", "groups", "checkpointVisits", "completedTrips", "proximityReports"]) assert.equal(after[field], 0, field);
    const overview = await tracking.getOverview(admin);
    assert.deepEqual(overview.routes[0].path, routeBody.path);
    assert.deepEqual(overview.routes[0].checkpoints.map(cp => cp.id), checkpoints.map(cp => cp.id));
    assert.equal(overview.proximityMonitors[0].memberId, null);
    assert.equal(overview.proximityMonitors[0].tagId, "WL-AABBCCDDEEFF");
    assert.equal(overview.proximityMonitors[0].status, "unseen");
    assert.equal((await registrationSummary(otherRoute, other)).cards, 1);
    assert.equal((await db.pool.query("SELECT count(*)::int AS n FROM devices")).rows[0].n, 1);
    assert.equal((await db.pool.query("SELECT count(*)::int AS n FROM checkpoint_reporters")).rows[0].n, 2);
    await assert.rejects(tracking.receiveReport(keys[0], oldScan), { status: 422 });
    await assert.rejects(proximity.receiveProximity(boardKey, oldReport), { status: 422 });
    const fresh = await tracking.receiveReport(keys[0], event("card-a", { observedAt: new Date(Date.now()+1000).toISOString() }));
    assert.equal(fresh.memberName, "Person 1"); assert.equal(fresh.registered, true);
    assert.equal((await registrationSummary(routeId, admin)).cards, 1);
    await clearRegistrations(routeId, admin, routeBody.name);
    assert.equal((await clearRegistrations(routeId, admin, routeBody.name)).deleted.cards, 0);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await db.closeDatabase(); await setup.query(`DROP SCHEMA ${schema} CASCADE`); await setup.end();
  }
});
