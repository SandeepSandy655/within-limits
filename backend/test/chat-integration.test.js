const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { io: clientSocket } = require('socket.io-client');

test('group chat: membership, persistence, live delivery, retries and removal', { skip: !process.env.TEST_DATABASE_URL }, async (t) => {
  const schema = `chat_test_${randomBytes(8).toString('hex')}`;
  const setup = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
  const firebase = require('../src/config/firebaseAdmin');
  firebase.getFirebaseAdminAuth = () => ({ verifyIdToken: async (token, revoked) => {
    assert.equal(revoked, true);
    if (!token?.startsWith('fixture:')) throw Object.assign(new Error('invalid'), { code: 'auth/invalid-id-token' });
    const uid = token.slice(8);
    return { uid, email: `${uid}@example.test`, email_verified: uid !== 'unverified', exp: Math.floor(Date.now() / 1000) + 3600 };
  } });
  const db = require('../src/config/database');
  let appServer; const sockets = []; const links = {};
  try {
    await setup.query(`CREATE SCHEMA ${schema}`); await db.connectDatabase();
    appServer = require('../src/server');
    await new Promise((resolve) => appServer.server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${appServer.server.address().port}`;
    const call = (path, body, uid = 'host') => fetch(`${base}/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(uid ? { Authorization: `Bearer fixture:${uid}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const service = require('../src/services/connectionService');
    for (const id of ['host', 'a', 'b', 'pending', 'outsider', 'other-host', 'other-member']) {
      assert.equal((await call('/devices/register', { deviceId: id, deviceName: `Phone ${id}` }, id)).status, 201);
    }
    for (const id of ['a', 'b', 'pending']) {
      links[id] = await service.sendConnectionRequest(id, 'host');
      if (id !== 'pending') await service.acceptConnection(links[id]._id, 'host', 1000);
    }
    const otherLink = await service.sendConnectionRequest('other-member', 'other-host');
    await service.acceptConnection(otherLink._id, 'other-host', 2000);
    const summary = async (id) => (await (await call(`/chat/device/${id}/summary`, undefined, id)).json());
    const history = async (id, query = '') => (await (await call(`/chat/device/${id}${query}`, undefined, id)).json());
    const send = async (id, body, clientMessageId = randomUUID(), membershipKey) => call('/chat/messages', {
      deviceId: id, body, clientMessageId, membershipKey: membershipKey || (await summary(id)).group?.membershipKey || 'not-a-member',
    }, id);
    function connect(id) {
      return new Promise((resolve, reject) => {
        const socket = clientSocket(base, { auth: { token: `fixture:${id}`, deviceId: id }, transports: ['websocket'], reconnection: false });
        sockets.push(socket);
        const timer = setTimeout(() => reject(new Error('Socket did not become ready')), 10000);
        socket.on('connect', () => socket.emit('device-online', { deviceId: id }));
        socket.once('device-ready', () => { clearTimeout(timer); resolve(socket); });
        socket.once('connect_error', (error) => { clearTimeout(timer); reject(error); });
      });
    }
    await t.test('authentication, ownership and approval are required', async () => {
      assert.equal((await call('/chat/device/host', undefined, null)).status, 401);
      assert.equal((await call('/chat/device/host', undefined, 'unverified')).status, 403);
      assert.equal((await call('/chat/device/host', undefined, 'a')).status, 403);
      for (const id of ['pending', 'outsider']) {
        assert.equal((await call(`/chat/device/${id}`, undefined, id)).status, 403);
        assert.equal((await send(id, 'Not approved')).status, 403);
        assert.equal((await summary(id)).group, null);
      }
      const group = (await summary('a')).group;
      assert.deepEqual(group.members.map((member) => member.deviceId).sort(), ['a', 'b', 'host']);
      assert.equal(group.members.some((member) => 'ownerId' in member || 'connectionCode' in member || 'location' in member), false);
    });
    let first;
    await t.test('members talk to the whole group, including another member, without GPS', async () => {
      const host = await connect('host'), a = await connect('a'), b = await connect('b');
      const outsider = await connect('outsider'), other = await connect('other-host');
      const packets = new Map();
      for (const [id, socket] of [['host', host], ['a', a], ['b', b], ['outsider', outsider], ['other', other]]) {
        packets.set(id, []); socket.on('chat-message', (packet) => packets.get(id).push(packet));
      }
      const result = await send('a', '  Hello everyone 👋\nMeet at the entrance.  ');
      assert.equal(result.status, 201); first = (await result.json()).message;
      await new Promise((resolve) => setTimeout(resolve, 150));
      for (const id of ['host', 'a', 'b']) assert.equal(packets.get(id)[0].message.id, first.id);
      assert.equal(packets.get('outsider').length, 0); assert.equal(packets.get('other').length, 0);
      assert.equal(first.senderId, 'a'); assert.equal(first.body, 'Hello everyone 👋\nMeet at the entrance.');
      b.disconnect();
      assert.equal((await send('host', 'Saved while you are offline.')).status, 201);
      assert.equal((await history('b')).messages.length, 2);
      assert.equal((await db.pool.query('SELECT COUNT(*)::int AS count FROM mobile_chat_messages')).rows[0].count, 2);
    });
    await t.test('concurrent retries create one message and cursors preserve committed order', async () => {
      const id = randomUUID(), key = (await summary('host')).group.membershipKey;
      const retries = await Promise.all(Array.from({ length: 5 }, () => send('host', 'One message', id, key)));
      assert.equal(retries.filter((response) => response.status === 201).length, 1);
      assert.equal(retries.filter((response) => response.status === 200).length, 4);
      const results = await Promise.all(retries.map((response) => response.json()));
      assert.equal(new Set(results.map((result) => result.message.id)).size, 1);
      assert.equal((await send('host', 'Changed payload', id, key)).status, 409);
      const after = await history('a', `?after=${first.id}`);
      assert.equal(after.messages.length, 2);
      assert.ok(after.messages.every((message, i, items) => !i || BigInt(message.id) > BigInt(items[i - 1].id)));
    });
    await t.test('read state is per device and another group cannot read or mark messages', async () => {
      const before = await summary('b'); assert.ok(before.unreadCount > 0);
      const latest = (await history('b')).messages.at(-1);
      assert.equal((await call('/chat/read', { deviceId: 'b', membershipKey: before.group.membershipKey, messageId: latest.id }, 'host')).status, 403);
      assert.equal((await call('/chat/read', { deviceId: 'b', membershipKey: before.group.membershipKey, messageId: latest.id }, 'b')).status, 200);
      assert.equal((await summary('b')).unreadCount, 0);
      assert.ok((await summary('a')).unreadCount > 0);
      const foreign = (await (await send('other-host', 'Another group’s message')).json()).message;
      assert.equal((await call('/chat/read', { deviceId: 'b', membershipKey: before.group.membershipKey, messageId: foreign.id }, 'b')).status, 404);
      assert.equal((await history('host', '?hostId=other-host')).messages.some((message) => message.id === foreign.id), false);
    });
    await t.test('late joins and rejoining never expose earlier group messages', async () => {
      await service.acceptConnection(links.pending._id, 'host', 1000);
      assert.equal((await history('pending')).messages.length, 0);
      const oldKey = (await summary('a')).group.membershipKey;
      await service.disconnectDevice(links.a._id, 'a');
      assert.equal((await call('/chat/device/a', undefined, 'a')).status, 403);
      assert.equal((await send('a', 'Removed member', randomUUID(), oldKey)).status, 403);
      const fresh = await service.sendConnectionRequest('a', 'host');
      await service.acceptConnection(fresh._id, 'host', 2000);
      assert.equal((await history('a')).messages.length, 0);
      assert.equal((await send('a', 'Stale group', randomUUID(), oldKey)).status, 409);
      assert.equal((await send('a', 'Back in the group.')).status, 201);
      assert.equal((await history('pending')).messages.length, 1);
      assert.equal((await summary('a')).group.members.length, 4);
    });
    await t.test('history pagination, message validation and rate limiting are bounded', async () => {
      for (const body of ['', '  ', 'x'.repeat(2001), 'bad\0text', { text: 'object' }]) assert.equal((await send('b', body)).status, 400);
      assert.equal((await send('b', 'bad id', 'not-a-uuid')).status, 400);
      for (const query of ['?before=-1', '?after=9223372036854775808', '?after=1&before=2']) assert.equal((await call(`/chat/device/host${query}`)).status, 400);
      await db.pool.query(`INSERT INTO mobile_chat_messages (host_device_id, sender_device_id, sender_name, client_message_id, body)
        SELECT 'host', 'b', 'Phone b', gen_random_uuid(), 'History ' || number FROM generate_series(1,60) AS number`);
      const recent = await history('host'); assert.equal(recent.messages.length, 50); assert.equal(recent.hasMore, true);
      assert.ok(recent.messages.every((message, index) => !index || BigInt(message.id) > BigInt(recent.messages[index - 1].id)), 'Message IDs must use numeric rather than text ordering.');
      const older = await history('host', `?before=${recent.messages[0].id}`);
      assert.ok(older.messages.length > 0);
      assert.equal(new Set([...recent.messages, ...older.messages].map((message) => message.id)).size, recent.messages.length + older.messages.length);
      const throttled = await send('b', 'Too fast'); assert.equal(throttled.status, 429); assert.equal(throttled.headers.get('retry-after'), '60');
    });
  } finally {
    sockets.forEach((socket) => socket.disconnect());
    if (appServer) await appServer.stopServer('chat test cleanup'); else await db.closeDatabase();
    await setup.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await setup.end();
  }
});
