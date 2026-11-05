const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, randomBytes } = require("node:crypto");
const { Pool } = require("pg");

test("automatic RFID trips: registration, ordered exit, release, re-entry and history isolation", { skip: !process.env.TEST_DATABASE_URL }, async (t) => {
  const schema = `trip_test_${randomBytes(8).toString("hex")}`;
  const setup = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  const db = require("../src/config/database");
  let server;
  try {
    await setup.query(`CREATE SCHEMA ${schema}`);
    await db.connectDatabase();
    // Exercise schema startup twice; the partial active-card index stays intact.
    await db.connectDatabase();
    const service = require("../src/services/trackingService");
    const admin = { uid: "trip-owner", role: "group_admin" }, other = { uid: "other-owner", role: "group_admin" };
    const makeRoute = async (owner, name) => {
      const body = { name, region: "Trip test", autoEnroll: true, path: [[0, 0], [0, 1], [0, 2]], checkpoints: ["Entrance", "Middle", "Exit"].map((name, index) => ({ id: randomUUID(), name, latitude: 0, longitude: index })) };
      const id = await service.saveRoute(body, null, owner);
      await db.pool.query("UPDATE monitoring_routes SET created_at = NOW() - INTERVAL '1 day' WHERE id=$1", [id]);
      const tokens = [];
      for (const cp of body.checkpoints) {
        const token = randomBytes(32).toString("base64url"); tokens.push(token);
        await db.pool.query("INSERT INTO checkpoint_reporters (id,checkpoint_id,token_hash) VALUES ($1,$2,$3)", [randomUUID(), cp.id, service.hashToken(token)]);
      }
      return { id, body, tokens };
    };
    const route = await makeRoute(admin, "Automatic trail"), foreign = await makeRoute(other, "Other trail");
    const express = require("express");
    const app = express(); app.use(express.json()); app.use("/api/tracking", require("../src/routes/trackingRoutes"));
    app.use((error, req, res, next) => res.status(error.status || 500).json({ success: false, message: error.message }));
    server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
    const baseTime = Date.now() - 30000;
    const event = (tagId, seconds, eventId = randomUUID()) => ({ tagId, observedAt: new Date(baseTime + seconds * 1000).toISOString(), eventId });
    const send = async (token, body) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/tracking/reports`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    };
    const entrance = event("card-one", 1), earlyExit = event("card-one", 3);
    let originalMemberId;
    await t.test("only entrance can register and concurrent scans allocate one active assignment", async () => {
      assert.equal((await send(route.tokens[2], event("unknown", 1))).status, 422);
      assert.equal((await send(route.tokens[1], event("unknown", 1))).status, 422);
      const results = await Promise.all([send(route.tokens[0], entrance), send(route.tokens[0], entrance), send(route.tokens[0], event("card-one", 1))]);
      assert.deepEqual(results.map((result) => result.status).sort(), [200, 201, 201]);
      assert.equal(results.filter((result) => result.body.registered).length, 1);
      assert.ok(results.every((result) => result.body.memberName === "Person 1"));
      const overview = await service.getOverview(admin);
      assert.equal(overview.groups[0].members.length, 1);
      originalMemberId = overview.groups[0].members[0].id;
      assert.equal((await send(foreign.tokens[0], event("card-one", 2))).status, 422);
    });
    await t.test("exit without the intermediate visit stays active; delayed in-order report completes and releases", async () => {
      assert.equal((await send(route.tokens[2], earlyExit)).body.tripStatus, "active");
      let overview = await service.getOverview(admin);
      assert.equal(overview.groups[0].members.length, 1);
      assert.equal(overview.completedTrips.length, 0);
      const finished = await send(route.tokens[1], event("card-one", 2));
      assert.equal(finished.body.tripStatus, "exited");
      assert.match(finished.body.message, /Person 1.*exited/);
      overview = await service.getOverview(admin);
      assert.equal(overview.groups.length, 0);
      assert.equal(overview.completedTrips[0].memberName, "Person 1");
      assert.equal(overview.completedTrips[0].checkpointName, "Exit");
      assert.equal(new Date(overview.completedTrips[0].exitedAt).toISOString(), earlyExit.observedAt);
      assert.equal(overview.routes[0].exitedCount, 1);
      assert.equal((await service.getOverview(other)).completedTrips.length, 0);
    });
    await t.test("old retries stay attached to the old trip; late scans cannot re-enroll or close the next trip", async () => {
      assert.equal((await send(route.tokens[0], entrance)).status, 200);
      assert.equal((await service.getOverview(admin)).groups.length, 0);
      assert.equal((await send(route.tokens[0], event("card-one", 2))).status, 422);
      const next = await send(route.tokens[0], event("card-one", 5));
      assert.equal(next.status, 201); assert.equal(next.body.registered, true); assert.equal(next.body.memberName, "Person 2");
      const retry = await send(route.tokens[2], earlyExit);
      assert.equal(retry.status, 200); assert.equal(retry.body.memberName, "Person 1");
      const overview = await service.getOverview(admin);
      assert.notEqual(overview.groups[0].members[0].id, originalMemberId);
      assert.equal(overview.groups[0].members[0].name, "Person 2");
      assert.equal(overview.groups[0].completedCheckpoints, 1);
      assert.equal(overview.completedTrips.length, 1);
      assert.equal((await send(route.tokens[2], event("card-one", 3))).status, 422);
      assert.equal((await send(route.tokens[0], { ...entrance, tagId: "different" })).status, 409);
    });
    await t.test("new cards get unique next names; active tags cannot be manually duplicated", async () => {
      const results = await Promise.all([send(route.tokens[0], event("card-two", 6)), send(route.tokens[0], event("card-three", 6))]);
      assert.deepEqual(results.map((result) => result.body.memberName).sort(), ["Person 3", "Person 4"]);
      await assert.rejects(service.createGroup({ routeId: foreign.id, name: "Duplicate", leaderName: "Test", members: [{ name: "Forged", tagId: "card-two" }] }, other), { code: "23505" });
      assert.equal((await service.getOverview(admin)).groups[0].members.length, 3);
    });
    await t.test("wrong-order exit requires a later exit and history stays visible after re-entry", async () => {
      await send(route.tokens[2], event("card-one", 7));
      assert.equal((await send(route.tokens[1], event("card-one", 8))).body.tripStatus, "active");
      assert.equal((await send(route.tokens[2], event("card-one", 9))).body.tripStatus, "exited");
      const overview = await service.getOverview(admin);
      assert.equal(overview.completedTrips.length, 2);
      assert.equal(overview.routes[0].exitedCount, 2);
      assert.ok(overview.groups[0].members.every((member) => member.name !== "Person 2"));
      assert.ok(overview.completedTrips.every((trip) => !("tagId" in trip)));
      await assert.rejects(service.saveRoute({ ...route.body, revision: 1, checkpoints: [...route.body.checkpoints].reverse() }, route.id, admin), { status: 409 });
      await assert.rejects(service.saveRoute({ ...route.body, revision: 1, autoEnroll: false }, route.id, admin), { status: 409 });
    });
    await t.test("revoked credentials cannot auto-register and manual routes remain opt-in", async () => {
      const manual = await service.saveRoute({ ...route.body, autoEnroll: false, checkpoints: route.body.checkpoints.map((cp) => ({ ...cp, id: randomUUID() })) }, null, admin);
      const cp = (await db.pool.query("SELECT id FROM checkpoints WHERE route_id=$1 ORDER BY position", [manual])).rows[0];
      const token = randomBytes(32).toString("base64url");
      await db.pool.query("INSERT INTO checkpoint_reporters (id,checkpoint_id,token_hash) VALUES ('manual',$1,$2)", [cp.id, service.hashToken(token)]);
      assert.equal((await send(token, event("manual-unknown", 10))).status, 422);
      await db.pool.query("UPDATE checkpoint_reporters SET revoked_at=NOW() WHERE token_hash=$1", [service.hashToken(route.tokens[0])]);
      assert.equal((await send(route.tokens[0], event("new-after-revoke", 10))).status, 401);
    });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await db.closeDatabase();
    await setup.query(`DROP SCHEMA ${schema} CASCADE`);
    await setup.end();
  }
});
