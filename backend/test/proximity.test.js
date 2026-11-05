const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, randomBytes } = require("node:crypto");
const { Pool } = require("pg");

test("BLE proximity: authenticated state, freshness, retries and owner isolation", { skip: !process.env.TEST_DATABASE_URL }, async (t) => {
  const schema = `proximity_test_${randomBytes(8).toString("hex")}`;
  const setup = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const url = new URL(process.env.TEST_DATABASE_URL); url.searchParams.set("options", `-c search_path=${schema}`); process.env.DATABASE_URL = url.toString();
  const db = require("../src/config/database");
  let server;
  try {
    await setup.query(`CREATE SCHEMA ${schema}`); await db.connectDatabase();
    const service = require("../src/services/proximityService"), tracking = require("../src/services/trackingService");
    const owner = { uid: "owner", role: "group_admin" }, other = { uid: "other", role: "group_admin" };
    const routeId = await tracking.saveRoute({ name: "BLE route", region: "Bench", path: [[0,0],[0,1]], checkpoints: [{ name: "Entrance", latitude: 0, longitude: 0 }, { name: "Exit", latitude: 0, longitude: 1 }] }, null, owner);
    const token = randomBytes(32).toString("base64url");
    await db.pool.query("INSERT INTO proximity_monitors(id,route_id,name,token_hash,created_at) VALUES ('ble',$1,'BLE Tag 1',$2,NOW()-INTERVAL '1 hour')", [routeId, service.hashToken(token)]);
    const express = require("express"), app = express(); app.use(express.json()); app.use("/api/proximity", require("../src/routes/proximityRoutes"));
    app.use("/api/admin", require("../src/routes/adminRoutes"));
    app.use((error, req, res, next) => res.status(error.status || 500).json({ success: false, message: error.message }));
    server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
    const send = (body, key = token) => fetch(`http://127.0.0.1:${server.address().port}/api/proximity/reports`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
    const event = (extra = {}) => ({ eventId: randomUUID(), tagId: "WL-AABBCCDDEEFF", observedAt: new Date().toISOString(), state: "near", rssi: -55, buzzerEnabled: true, ...extra });
    await t.test("unknown board stays unseen; authorization and sensor validation are enforced", async () => {
      assert.equal((await tracking.getOverview(owner)).proximityMonitors[0].status, "unseen");
      assert.equal((await tracking.getOverview(other)).proximityMonitors.length, 0);
      assert.equal((await send(event(), "invalid")).status, 401);
      for (const extra of [{ routeId }, { state: "near", rssi: null }, { state: "lost", rssi: -80 }, { rssi: 127 }, { buzzerEnabled: "true" }, { tagId: "card-id" }, { state: "safe" }]) assert.equal((await send(event(extra))).status, 400);
    });
    await t.test("concurrent retries bind one board and never create RFID visits", async () => {
      const first = event();
      const responses = await Promise.all([send(first), send(first)]);
      assert.deepEqual(responses.map(r => r.status).sort(), [200,201]);
      assert.equal((await send({ ...first, state: "far" })).status, 409);
      assert.equal((await send(event({ tagId: "WL-112233445566" }))).status, 422);
      const overview = await tracking.getOverview(owner);
      assert.equal(overview.proximityMonitors[0].status, "near");
      assert.equal(overview.groups.length, 0);
      assert.equal((await db.pool.query("SELECT COUNT(*)::int AS n FROM checkpoint_reports")).rows[0].n, 0);
      assert.ok(!("token_hash" in overview.proximityMonitors[0]));
    });
    await t.test("far/lost alarms, delayed delivery and offline state remain distinct", async () => {
      const far = event({ observedAt: new Date(Date.now()+1000).toISOString(), state: "far", rssi: -85 });
      assert.equal((await send(far)).status, 201);
      let monitor = (await tracking.getOverview(owner)).proximityMonitors[0];
      assert.equal(monitor.status, "far"); assert.equal(monitor.alarm, true);
      assert.equal((await send(event({ observedAt: new Date(Date.now()-10000).toISOString() }))).status, 201);
      assert.equal((await tracking.getOverview(owner)).proximityMonitors[0].status, "far");
      assert.equal((await send(event({ observedAt: new Date(Date.now()+2000).toISOString(), state: "lost", rssi: null, buzzerEnabled: false }))).status, 201);
      monitor = (await tracking.getOverview(owner)).proximityMonitors[0];
      assert.equal(monitor.status, "lost"); assert.equal(monitor.alarm, false);
      monitor = (await service.getProximityOverview([routeId], Date.now()+40000))[0];
      assert.equal(monitor.status, "offline"); assert.equal(monitor.alarm, false);
      await db.pool.query("UPDATE proximity_reports SET received_at=NOW()-INTERVAL '1 minute'");
      assert.equal((await tracking.getOverview(owner)).proximityMonitors[0].status, "offline");
    });
    await t.test("group linking enforces ownership, exclusivity and fresh observations", async () => {
      const groupId = await tracking.createGroup({ routeId, name: "Walking group", leaderName: "Ada", members: [{ name: "Ada", tagId: "ada-card" }, { name: "Sam", tagId: "sam-card" }] }, owner);
      const group = (await tracking.getOverview(owner)).groups.find(g=>g.id===groupId);
      const ada = group.members.find(m=>m.name==="Ada"), sam = group.members.find(m=>m.name==="Sam");
      const denied = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/proximity/ble/assignment`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberId: ada.id }) });
      assert.equal(denied.status, 401);
      await assert.rejects(service.assignProximity("ble", ada.id, other), { status: 404 });
      await assert.rejects(service.assignProximity("ble", randomUUID(), owner), { status: 422 });
      await service.assignProximity("ble", ada.id, owner);
      let monitor = (await tracking.getOverview(owner)).proximityMonitors[0];
      assert.equal(monitor.memberId, ada.id); assert.equal(monitor.groupId, groupId); assert.equal(monitor.assignmentFresh, false);
      assert.equal((await send(event({ observedAt: new Date(Date.now()+3000).toISOString() }))).status, 201);
      monitor = (await tracking.getOverview(owner)).proximityMonitors[0];
      assert.equal(monitor.assignmentFresh, true);
      const assignedAt = monitor.assignedAt;
      await service.assignProximity("ble", ada.id, owner);
      assert.equal((await tracking.getOverview(owner)).proximityMonitors[0].assignedAt.toISOString(), assignedAt.toISOString());
      await db.pool.query("INSERT INTO proximity_monitors(id,route_id,name,token_hash) VALUES ('spare',$1,'Spare',$2)", [routeId, service.hashToken(randomBytes(32).toString("hex"))]);
      await assert.rejects(service.assignProximity("spare", ada.id, owner), { status: 409 });
      await service.assignProximity("ble", sam.id, owner);
      monitor = (await tracking.getOverview(owner)).proximityMonitors.find(m=>m.id==='ble');
      assert.equal(monitor.memberId, sam.id); assert.equal(monitor.assignmentFresh, false);
      await service.assignProximity("ble", null, owner);
      await service.assignProximity("ble", ada.id, owner);
      await db.pool.query("UPDATE monitoring_routes SET auto_enroll=TRUE WHERE id=$1", [routeId]);
      const checkpoints = (await tracking.getOverview(owner)).routes[0].checkpoints;
      const keys = [randomBytes(32).toString('hex'),randomBytes(32).toString('hex')];
      for(let i=0;i<2;i++) await db.pool.query("INSERT INTO checkpoint_reporters(id,checkpoint_id,token_hash) VALUES ($1,$2,$3)", [`cp-${i}`,checkpoints[i].id,service.hashToken(keys[i])]);
      const report = seconds => ({ eventId: randomUUID(), tagId: "ada-card", observedAt: new Date(Date.now()+seconds*1000).toISOString() });
      await tracking.receiveReport(keys[0], report(5)); await tracking.receiveReport(keys[1], report(6));
      monitor = (await tracking.getOverview(owner)).proximityMonitors.find(m=>m.id==='ble');
      assert.equal(monitor.memberId, null); assert.equal(monitor.assignedAt, null);
      await assert.rejects(service.assignProximity("ble", ada.id, owner), { status: 422 });
      await tracking.receiveReport(keys[0], report(7));
      assert.equal((await tracking.getOverview(owner)).proximityMonitors.find(m=>m.id==='ble').memberId, null);
    });
    await t.test("two-minute alerts persist across reads and reset after recovery and reassignment", async (t) => {
      const groupId = await tracking.createGroup({ routeId, name: "Alert test", leaderName: "Lee", members: [{ name: "Lee", tagId: "alert-card" }, { name: "Pat", tagId: "alert-other" }] }, owner);
      const group = (await tracking.getOverview(owner)).groups.find(g => g.id === groupId);
      const alertToken = randomBytes(32).toString("base64url");
      await db.pool.query("INSERT INTO proximity_monitors(id,route_id,name,token_hash,created_at) VALUES ('timed',$1,'Timed device',$2,NOW()-INTERVAL '1 hour')", [routeId, service.hashToken(alertToken)]);
      await service.assignProximity("timed", group.members[0].id, owner);
      const start = Date.now() - 180000;
      await db.pool.query("UPDATE proximity_monitors SET assigned_at=$1 WHERE id='timed'", [new Date(start - 1000)]);
      let simulated = start;
      t.mock.method(Date, "now", () => simulated);
      const sendTimed = async (elapsed, state = "far") => {
        simulated = start + elapsed;
        const body = event({ observedAt: new Date(simulated).toISOString(), state, rssi: state === "lost" ? null : -85, buzzerEnabled: false });
        await service.receiveProximity(alertToken, body);
        await db.pool.query("UPDATE proximity_reports SET received_at=$1 WHERE monitor_id='timed' AND event_id=$2", [new Date(simulated), body.eventId]);
        return body;
      };
      const read = async () => (await service.getProximityOverview([routeId], simulated)).find(m => m.id === "timed");
      for (let elapsed = 0; elapsed <= 120000; elapsed += 10000) {
        const body = await sendTimed(elapsed, elapsed < 60000 ? "far" : "lost");
        const row = await read();
        assert.equal(row.proximityAlert, elapsed >= 120000);
        assert.equal(row.outOfRangeSince.getTime(), start);
        assert.equal(row.alarm, false);
        assert.equal((await service.receiveProximity(alertToken, body)).duplicate, true);
      }
      assert.equal((await read()).proximityAlert, true);
      assert.equal((await service.getProximityOverview([routeId], simulated + 31000)).find(m => m.id === "timed").proximityAlert, false);
      await sendTimed(130000, "near");
      assert.equal((await read()).outOfRangeSince, null);
      assert.equal((await read()).proximityAlert, false);
      await sendTimed(140000);
      assert.equal((await read()).outOfRangeSince.getTime(), start + 140000);
      await service.assignProximity("timed", group.members[1].id, owner);
      assert.equal((await read()).outOfRangeSince, null);
      assert.equal((await read()).proximityAlert, false);
    });
    await t.test("revocation stops reporting and hides live alarm assertions", async () => {
      await db.pool.query("UPDATE proximity_monitors SET revoked_at=NOW() WHERE id='ble'");
      assert.equal((await send(event())).status, 401);
      assert.equal((await tracking.getOverview(owner)).proximityMonitors[0].status, "revoked");
    });
  } finally {
    if(server) await new Promise(resolve=>server.close(resolve));
    await db.closeDatabase(); await setup.query(`DROP SCHEMA ${schema} CASCADE`); await setup.end();
  }
});
