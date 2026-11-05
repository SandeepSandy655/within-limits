const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { Pool } = require('pg');

test('college demo: archive old route, release cards, register next scans and rename only owned active holders', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const schema = `college_test_${randomBytes(8).toString('hex')}`;
  const setup = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const url = new URL(process.env.TEST_DATABASE_URL); url.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  const db = require('../src/config/database');
  try {
    await setup.query(`CREATE SCHEMA ${schema}`); await db.connectDatabase();
    const tracking = require('../src/services/trackingService');
    const { prepareCollegeDemo } = require('../src/services/collegeDemo');
    const { renameCardHolder } = require('../src/services/cardAssignments');
    const owner = { uid: 'owner', role: 'group_admin' };
    const other = { uid: 'other', role: 'group_admin' };
    const make = async (name, count) => {
      const points = Array.from({ length: count }, (_, index) => ({ id: randomUUID(), name: `Stop ${index + 1}`, latitude: 0, longitude: index }));
      const id = await tracking.saveRoute({ name, region: 'Test', autoEnroll: true, path: points.map(point => [point.latitude, point.longitude]), checkpoints: points }, null, owner);
      return { id, points };
    };
    const old = await make('RFID test route', 2), college = await make('College test route', 4);
    const token = randomBytes(32).toString('base64url'), oldToken = randomBytes(32).toString('base64url');
    await db.pool.query('INSERT INTO checkpoint_reporters(id,checkpoint_id,token_hash) VALUES ($1,$2,$3),($4,$5,$6)', [randomUUID(), college.points[0].id, tracking.hashToken(token), randomUUID(), old.points[0].id, tracking.hashToken(oldToken)]);
    await tracking.createGroup({ routeId: old.id, name: 'Old group', leaderName: 'Tester', members: [{ name: 'Old holder', tagId: 'AABBCCDD' }] }, owner);
    let backup;
    const result = await prepareCollegeDemo(old.id, college.id, async data => { backup = data; });
    assert.equal(result.releasedCards, 1); assert.equal(backup.members.length, 1);
    assert.equal((await tracking.getOverview(owner)).routes.length, 1);
    assert.equal((await prepareCollegeDemo(old.id, college.id)).alreadyPrepared, true);
    await assert.rejects(tracking.receiveReport(oldToken, { eventId: randomUUID(), tagId: 'AABBCCDD', observedAt: new Date().toISOString() }), { status: 410 });
    const scan = { eventId: randomUUID(), tagId: 'AABBCCDD', observedAt: new Date().toISOString() };
    const registered = await tracking.receiveReport(token, scan);
    assert.equal(registered.registered, true); assert.equal(registered.memberName, 'Person 1');
    assert.equal((await tracking.receiveReport(token, scan)).duplicate, true);
    const member = (await tracking.getOverview(owner)).groups[0].members[0];
    assert.equal(member.tagId, 'AABBCCDD');
    await assert.rejects(renameCardHolder(member.id, 'Not allowed', other), { status: 404 });
    await assert.rejects(renameCardHolder(member.id, '', owner), { status: 400 });
    await renameCardHolder(member.id, 'Student One', owner);
    assert.equal((await tracking.getOverview(owner)).groups[0].members[0].name, 'Student One');
    assert.equal((await db.pool.query('SELECT COUNT(*)::int AS count FROM tracking_members WHERE tag_id=$1 AND active', ['AABBCCDD'])).rows[0].count, 1);
  } finally {
    await db.closeDatabase(); await setup.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await setup.end();
  }
});
