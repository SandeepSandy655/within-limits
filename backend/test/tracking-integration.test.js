const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, randomBytes } = require("node:crypto");
const { Pool } = require("pg");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");
const execFile = promisify(require("node:child_process").execFile);

test("checkpoint monitoring: ingestion, isolation, retries, route persistence and freshness", { skip: !process.env.TEST_DATABASE_URL }, async (t) => {
  const schema = `tracking_test_${randomBytes(8).toString("hex")}`;
  const setup = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  const db = require("../src/config/database");
  let server;
  try {
    await setup.query(`CREATE SCHEMA ${schema}`);
    await db.connectDatabase();
    const service = require("../src/services/trackingService");
    const admin = { uid: "operator-one", role: "group_admin" };
    const other = { uid: "operator-two", role: "group_admin" };
    const superAdmin = { uid: "owner", role: "super_admin" };
    const routeBody = { name: "Test trail", region: "Test region", path: [[12.9716, 77.5946], [12.975, 77.597]], checkpoints: [{ id: randomUUID(), name: "Entrance", latitude: 12.9716, longitude: 77.5946 }, { id: randomUUID(), name: "Finish", latitude: 12.975, longitude: 77.597 }] };
    const routeId = await service.saveRoute(routeBody, null, admin);
    const otherRouteId = await service.saveRoute({ ...routeBody, checkpoints: routeBody.checkpoints.map((cp) => ({ ...cp, id: randomUUID() })) }, null, other);
    const groupId = await service.createGroup({ name: "Test group", leaderName: "Alex", routeId, members: [{ name: "Alex", tagId: "tag-a" }, { name: "Sam", tagId: "tag-b" }] }, admin);
    await service.createGroup({ name: "Other group", leaderName: "Lee", routeId: otherRouteId, members: [{ name: "Lee", tagId: "tag-other" }] }, other);
    // The test group predates offline observations, without waiting for wall-clock time.
    await db.pool.query("UPDATE tracked_groups SET created_at = NOW() - INTERVAL '2 days' WHERE id = $1", [groupId]);
    const token = randomBytes(32).toString("base64url");
    const finishToken = randomBytes(32).toString("base64url");
    await db.pool.query("INSERT INTO checkpoint_reporters (id, checkpoint_id, token_hash) VALUES ('entrance',$1,$2),('finish',$3,$4)", [routeBody.checkpoints[0].id, service.hashToken(token), routeBody.checkpoints[1].id, service.hashToken(finishToken)]);
    const express = require("express");
    const app = express(); app.use(express.json()); app.use("/api/tracking", require("../src/routes/trackingRoutes")); app.use("/api/admin", require("../src/routes/adminRoutes"));
    app.use((error, req, res, next) => res.status(error.status || 500).json({ success: false, message: error.message }));
    server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const send = (body, key = token) => fetch(`${base}/api/tracking/reports`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
    const first = { eventId: "first", tagId: "tag-a", observedAt: new Date().toISOString() };
    await t.test("admin requests require authentication and owners are isolated", async () => {
      assert.equal((await fetch(`${base}/api/admin/overview`)).status, 401);
      assert.equal((await service.getOverview(admin)).routes.length, 1);
      assert.equal((await service.getOverview(superAdmin)).routes.length, 2);
      await assert.rejects(service.createGroup({ name: "Forged", leaderName: "X", routeId: otherRouteId, members: [{ name: "X", tagId: "x" }] }, admin), { status: 404 });
      await assert.rejects(service.saveRoute({ ...routeBody, revision: 1 }, otherRouteId, admin), { status: 404 });
    });
    await t.test("first observation is accepted, retries are idempotent, forged scope is rejected", async () => {
      assert.equal((await send(first, "wrong-key")).status, 401);
      assert.equal((await send({ ...first, tagId: "unknown" })).status, 422);
      assert.equal((await send({ ...first, tagId: "tag-other" })).status, 422);
      assert.equal((await send({ ...first, checkpointId: routeBody.checkpoints[1].id })).status, 400);
      assert.equal((await send(first)).status, 201);
      const duplicate = await send(first); assert.equal(duplicate.status, 200); assert.equal((await duplicate.json()).duplicate, true);
      assert.equal((await send({ ...first, tagId: "tag-b" })).status, 409);
      const concurrent = await Promise.all(Array.from({ length: 4 }, () => send({ ...first, eventId: "concurrent" })));
      assert.deepEqual(concurrent.map((response) => response.status).sort(), [200, 200, 200, 201]);
    });
    await t.test("old reports cannot move the latest sighting backward; checkpoint completion needs all members", async () => {
      const latestTime = new Date(Date.now() + 1000).toISOString();
      assert.equal((await send({ ...first, eventId: "latest-entrance", observedAt: latestTime })).status, 201);
      assert.equal((await send({ ...first, eventId: "offline" })).status, 201);
      let overview = await service.getOverview(admin);
      assert.equal(overview.groups[0].members.find((m) => m.name === "Alex").checkpointId, routeBody.checkpoints[0].id);
      assert.equal(new Date(overview.groups[0].members.find((m) => m.name === "Alex").lastSeen).toISOString(), latestTime);
      assert.equal(overview.groups[0].completedCheckpoints, 0);
      assert.equal(overview.groups[0].status, "attention");
      assert.equal((await send({ ...first, tagId: "tag-b", eventId: "sam" })).status, 201);
      overview = await service.getOverview(admin);
      assert.equal(overview.groups[0].completedCheckpoints, 1);
      assert.equal(overview.groups[0].status, "active");
      assert.equal(overview.groups[0].members.find((m) => m.name === 'Alex').tagId, 'tag-a');
      assert.equal(overview.groups[0].members.some((m) => "location" in m), false);
      await db.pool.query("UPDATE checkpoint_reports SET observed_at = NOW() - INTERVAL '10 minutes'");
      assert.equal((await service.getOverview(admin)).groups[0].status, "attention");
    });
    await t.test("app connections do not appear as tracked groups", async () => {
      await db.pool.query("INSERT INTO devices (id, device_id, location) VALUES ('phone1','phone1','{\"coordinates\":[77,12]}'),('phone2','phone2',NULL)");
      await db.pool.query("INSERT INTO connections (id, requester_id, receiver_id, status) VALUES ('connection','phone1','phone2','accepted')");
      assert.equal((await service.getOverview(admin)).groups.length, 1);
    });
    await t.test("route edits persist, revisions prevent overwrites, used checkpoints are protected", async () => {
      await service.saveRoute({ ...routeBody, name: "Updated trail", revision: 1 }, routeId, admin);
      assert.equal((await service.getOverview(admin)).routes[0].name, "Updated trail");
      await assert.rejects(service.saveRoute({ ...routeBody, revision: 2, checkpoints: routeBody.checkpoints.map((cp) => ({ ...cp, latitude: cp.latitude + 0.001 })) }, routeId, admin), { status: 409 });
      await assert.rejects(service.saveRoute({ ...routeBody, revision: 1 }, routeId, admin), { status: 409 });
      await assert.rejects(service.saveRoute({ ...routeBody, revision: 2, checkpoints: routeBody.checkpoints.map((cp) => ({ ...cp, id: randomUUID() })) }, routeId, admin), { status: 409 });
    });
    await t.test("revoked credentials stop new reports", async () => {
      await db.pool.query("UPDATE checkpoint_reporters SET revoked_at = NOW() WHERE id = 'entrance'");
      assert.equal((await send({ ...first, eventId: "revoked" })).status, 401);
    });
    await t.test("provisioning writes private credentials, rotation replaces them, and revocation works", async () => {
      const directory = await fs.mkdtemp(path.join(os.tmpdir(), "within-limits-provision-test-"));
      const configPath = path.join(directory, "initial.json");
      const rotatedPath = path.join(directory, "rotated.json");
      const provision = (args) => execFile(process.execPath, [path.resolve(__dirname, "../src/scripts/provisionReporter.js"), ...args], { env: process.env, windowsHide: true });
      try {
        const common = ["--id", "provision-test", "--checkpoint", routeBody.checkpoints[0].id];
        const result = await provision([...common, "--output", configPath]);
        const config = JSON.parse(await fs.readFile(configPath, "utf8"));
        assert.ok(config.token.length >= 32);
        assert.ok(!result.stdout.includes(config.token));
        assert.equal((await send({ ...first, eventId: "provision-initial" }, config.token)).status, 201);
        await assert.rejects(provision([...common, "--output", configPath]));
        await provision([...common, "--output", rotatedPath, "--rotate"]);
        const rotated = JSON.parse(await fs.readFile(rotatedPath, "utf8"));
        assert.notEqual(config.token, rotated.token);
        assert.equal((await send({ ...first, eventId: "provision-old" }, config.token)).status, 401);
        assert.equal((await send({ ...first, eventId: "provision-new" }, rotated.token)).status, 201);
        await provision(["--id", "provision-test", "--revoke"]);
        assert.equal((await send({ ...first, eventId: "provision-revoked" }, rotated.token)).status, 401);
      } finally {
        await fs.unlink(configPath).catch(() => {});
        await fs.unlink(rotatedPath).catch(() => {});
        await fs.rmdir(directory);
      }
    });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await db.closeDatabase();
    await setup.query(`DROP SCHEMA ${schema} CASCADE`);
    await setup.end();
  }
});
