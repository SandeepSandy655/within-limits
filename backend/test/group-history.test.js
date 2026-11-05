const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, randomBytes } = require("node:crypto");
const { Pool } = require("pg");

test("groups move to paginated history only when everyone finishes, keeping route snapshots and logs", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const schema = `history_test_${randomBytes(8).toString("hex")}`;
  const setup = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const url = new URL(process.env.TEST_DATABASE_URL); url.searchParams.set("options", `-c search_path=${schema}`); process.env.DATABASE_URL = url.toString();
  const db = require("../src/config/database");
  try {
    await setup.query(`CREATE SCHEMA ${schema}`); await db.connectDatabase();
    const tracking = require("../src/services/trackingService");
    const history = require("../src/services/groupHistory");
    const owner = { uid: "college-admin", role: "group_admin" }, other = { uid: "other", role: "group_admin" };
    const names = ["College entrance", "Main block", "Library junction", "College exit"];
    const path = [[10,10],[65,10],[65,65],[10,65]];
    const routeBody = { name: "College test", region: "Test layout", mapMode: "schematic", autoEnroll: false, path, checkpoints: names.map((name,i) => ({ id: randomUUID(), name, latitude:path[i][0], longitude:path[i][1] })) };
    const routeId = await tracking.saveRoute(routeBody, null, owner);
    const groupId = await tracking.createGroup({ routeId, name: "Test group A", leaderName: "Asha", members: [{ name: "Asha", tagId: "card-a" }, { name: "Ravi", tagId: "card-b" }] }, owner);
    const keys = names.map(() => randomBytes(32).toString("hex"));
    for(let i=0;i<4;i++) await db.pool.query("INSERT INTO checkpoint_reporters(id,checkpoint_id,token_hash) VALUES ($1,$2,$3)", [`cp-${i}`,routeBody.checkpoints[i].id,tracking.hashToken(keys[i])]);
    let sequence=0; const start=Date.now();
    const scan = (card, point) => tracking.receiveReport(keys[point], { eventId:randomUUID(), tagId:card, observedAt:new Date(start + ++sequence*100).toISOString() });
    for(let i=0;i<4;i++) await scan("card-a",i);
    let overview=await tracking.getOverview(owner);
    assert.equal(overview.groups[0].members.length,1); assert.equal(overview.groups[0].finishedMembers,1); assert.equal(overview.groups[0].totalMembers,2);
    assert.equal((await history.getGroupHistory(owner)).total,0);
    await scan("card-b",0); await scan("card-b",1); await scan("card-b",3); await scan("card-b",2);
    assert.equal((await history.getGroupHistory(owner)).total,0);
    await scan("card-b",3);
    overview=await tracking.getOverview(owner);
    assert.equal(overview.groups.length,0); assert.equal(overview.routes[0].completedGroups,1);
    const log=await history.getGroupHistoryDetails(groupId,owner);
    assert.equal(log.members.length,2); assert.equal(log.scans.length,9); assert.equal(log.group.route.mapMode,"schematic");
    assert.deepEqual(log.group.route.checkpoints.map(cp=>cp.name),names);
    await assert.rejects(history.getGroupHistoryDetails(groupId,other),{status:404});
    assert.equal((await history.getGroupHistory(other)).total,0);
    await tracking.saveRoute({ ...routeBody, revision:1, name:"Renamed route", checkpoints:routeBody.checkpoints.map(cp=>({...cp,name:`Changed ${cp.name}`})) },routeId,owner);
    assert.equal((await history.getGroupHistory(owner)).groups[0].routeName,"College test");
    assert.equal((await history.getGroupHistoryDetails(groupId,owner)).scans[0].checkpointName,"College entrance");
    const freshGroup=await tracking.createGroup({ routeId, name:"Test group B", leaderName:"Asha", members:[{name:"Asha",tagId:"card-a"}] },owner);
    assert.notEqual(freshGroup,groupId); assert.equal((await history.getGroupHistory(owner)).total,1);
    // More than one page stays reachable rather than silently hiding old groups.
    for(let i=0;i<21;i++) await db.pool.query("INSERT INTO tracked_groups(id,route_id,name,leader_name,completed_at,route_snapshot) VALUES ($1,$2,$3,'Test',NOW()-($4::int * INTERVAL '1 hour'),$5::jsonb)",[randomUUID(),routeId,`Old run ${i}`,i+1,JSON.stringify(log.group.route)]);
    assert.equal((await history.getGroupHistory(owner,{page:"1"})).groups.length,20);
    assert.equal((await history.getGroupHistory(owner,{page:"2"})).groups.length,2);
    await assert.rejects(history.getGroupHistory(owner,{page:"0"}),{status:400});
  } finally { await db.closeDatabase(); await setup.query(`DROP SCHEMA ${schema} CASCADE`); await setup.end(); }
});
