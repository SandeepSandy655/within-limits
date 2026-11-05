const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { Pool } = require('pg');
const { io: clientSocket } = require('socket.io-client');

test('verified mobile groups: ownership, capacity races, expiry, sockets and privacy', { skip: !process.env.TEST_DATABASE_URL }, async (t) => {
  process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
  const schema = `mobile_test_${randomBytes(8).toString('hex')}`;
  const setup = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const url = new URL(process.env.TEST_DATABASE_URL); url.searchParams.set('options', `-c search_path=${schema}`); process.env.DATABASE_URL = url.toString();
  // Stub the external identity provider only. HTTP, sockets, ownership checks and SQL are real.
  const firebase = require('../src/config/firebaseAdmin');
  firebase.getFirebaseAdminAuth = () => ({ verifyIdToken: async (token, revoked) => {
    assert.equal(revoked, true);
    if (!token?.startsWith('fixture:')) throw Object.assign(new Error('invalid'), { code: 'auth/invalid-id-token' });
    const uid = token.slice(8); return { uid, email: `${uid}@example.test`, email_verified: uid !== 'unverified', exp: Math.floor(Date.now() / 1000) + 3600 };
  } });
  const db = require('../src/config/database');
  let appServer; const sockets = []; const activeSockets = new Map();
  try {
    await setup.query(`CREATE SCHEMA ${schema}`); await db.connectDatabase();
    appServer = require('../src/server');
    await new Promise((resolve) => appServer.server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${appServer.server.address().port}`;
    const call = (path, body, uid = 'host') => fetch(`${base}/api${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(uid ? { Authorization: `Bearer fixture:${uid}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const service = require('../src/services/connectionService');
    const devices = {};
    await t.test('registration requires verification and ignores forged owner IDs', async () => {
      assert.equal((await call('/devices/register', { deviceId: 'd' }, null)).status, 401);
      assert.equal((await call('/devices/register', { deviceId: 'd' }, 'unverified')).status, 403);
      for (const id of ['host', 'a', 'b', 'c', 'd', 'e', 'other', 'lonely', 'spare']) {
        const response = await call('/devices/register', { deviceId: id, deviceName: `Phone ${id}`, ownerId: 'forged' }, id);
        assert.equal(response.status, 201); devices[id] = (await response.json()).device; assert.equal(devices[id].ownerId, id);
      }
      assert.equal((await call('/devices/register', { deviceId: 'host', deviceName: 'Hijacked' }, 'a')).status, 400);
      assert.equal((await call('/devices/host', undefined, 'a')).status, 403);
      assert.equal((await call('/devices', undefined, 'a')).status, 404);
      assert.equal((await call('/connections/device/host', undefined, 'a')).status, 403);
      assert.equal((await call('/notifications/device/host', undefined, 'a')).status, 403);
    });
    await t.test('six simultaneous requests can reserve only three guest spaces', async () => {
      const results = await Promise.all(['a', 'b', 'c', 'd', 'e', 'other'].map((id) => call('/connections/request-by-code', { requesterId: id, connectionCode: devices.host.connectionCode }, id)));
      assert.equal(results.filter((r) => r.status === 201).length, 3);
      assert.equal(results.filter((r) => r.status === 400).length, 3);
      const links = await service.getPendingRequests('host'); assert.equal(links.length, 3);
      const first = links[0];
      const retry = await call('/connections/request-by-code', { requesterId: first.requesterId, connectionCode: devices.host.connectionCode }, first.requesterId);
      assert.equal((await retry.json()).connection._id, first._id);
      assert.equal((await call('/connections/accept', { connectionId: first._id, deviceId: 'host' }, 'a')).status, 403);
      for (const rangeMeters of [undefined, '1000', 10000]) {
        assert.equal((await call('/connections/accept', { connectionId: first._id, deviceId: 'host', rangeMeters })).status, 400);
      }
      for (const link of links) {
        const response = await call('/connections/accept', { connectionId: link._id, deviceId: 'host', rangeMeters: 2000 });
        assert.equal(response.status, 200); assert.equal((await response.json()).connection.rangeMeters, 2000);
      }
      assert.equal((await call('/connections/accept', { connectionId: first._id, deviceId: 'host' })).status, 200);
      assert.equal((await service.getDeviceConnections('host')).filter((c) => c.status === 'accepted').length + 1, 4);
      await assert.rejects(service.sendConnectionRequest('spare', 'host'), /group is full/);
      await assert.rejects(service.sendConnectionRequest('host', 'lonely'), /already linked/);
      assert.equal((await call('/connections/request-by-code', { requesterId: 'spare', connectionCode: devices.host.connectionCode }, 'a')).status, 403);
      assert.equal((await service.previewHost(devices.host.connectionCode, 'spare')).available, 0);
      assert.equal((await (await call('/devices/host')).json()).device.connectionCode, null);
      const member = first.requesterId;
      assert.equal((await (await call(`/devices/${member}`, undefined, member)).json()).device.connectionCode, null);
      assert.equal((await (await call('/devices/register', { deviceId: member, deviceName: 'Member' }, member)).json()).device.connectionCode, null);
      assert.equal((await call('/connections/request-by-code', { requesterId: 'lonely', connectionCode: devices[member].connectionCode }, 'lonely')).status, 400);
      await assert.rejects(service.previewHost(devices[member].connectionCode, 'lonely'), /cannot host/);
      const inbox = await (await call('/notifications/device/host')).json();
      assert.equal(inbox.notifications.filter((note) => note.kind === 'connection-request').length, 3, 'Retries must not duplicate notifications');
    });
    await t.test('disconnect, cancel and expired requests release capacity', async () => {
      const link = (await service.getDeviceConnections('host'))[0];
      await service.disconnectDevice(link._id, 'host');
      const fresh = await service.sendConnectionRequest('spare', 'host');
      await service.cancelConnection(fresh._id, 'spare');
      assert.equal((await service.previewHost(devices.host.connectionCode, 'spare')).available, 1);
      const expired = await service.sendConnectionRequest('spare', 'host');
      await db.pool.query("UPDATE connections SET created_at = NOW() - INTERVAL '11 minutes' WHERE id = $1", [expired._id]);
      await assert.rejects(service.acceptConnection(expired._id, 'host'), /expired/);
      assert.equal((await service.getPendingRequests('host')).length, 0);
      const retry = await service.sendConnectionRequest('spare', 'host');
      await service.acceptConnection(retry._id, 'host', 1000);
      await assert.rejects(service.sendConnectionRequest('spare', 'lonely'), /already linked/);
      await assert.rejects(service.sendConnectionRequest('lonely', 'spare'), /linked to another host/);
    });
    function connect(uid, deviceId) {
      return new Promise((resolve, reject) => {
        const socket = clientSocket(base, { auth: { token: `fixture:${uid}`, deviceId }, transports: ['websocket'], reconnection: false }); sockets.push(socket);
        const timer = setTimeout(() => reject(new Error('socket timeout')), 5000);
        socket.on('connect', () => socket.emit('device-online', { deviceId }));
        socket.once('device-ready', () => { clearTimeout(timer); activeSockets.set(deviceId, socket); resolve(socket); });
        socket.once('connect_error', (error) => { clearTimeout(timer); reject(error); });
      });
    }
    await t.test('socket authentication, GPS relay and sharing pause protect location', async () => {
      await assert.rejects(connect('a', 'host'), /Register this device/);
      await assert.rejects(connect('unverified', 'host'), /Verify your email/);
      const host = await connect('host', 'host'); const spare = await connect('spare', 'spare'); const outsider = await connect('lonely', 'lonely');
      let leaked = false; outsider.on('device-location', () => { leaked = true; }); outsider.on('device-status', () => { leaked = true; });
      assert.equal((await call('/devices/sharing', { deviceId: 'host', sharingEnabled: true })).status, 200);
      await require('../src/services/deviceService').updateDeviceLocation('host', 12.97, 77.59, 10);
      assert.equal((await call('/devices/sharing', { deviceId: 'spare', sharingEnabled: true }, 'spare')).status, 200);
      const fix = new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('location not delivered')), 5000); host.once('device-location', (data) => { clearTimeout(timer); resolve(data); }); });
      spare.emit('device-location', { deviceId: 'spare', latitude: 12.97, longitude: 77.59, accuracy: 10 });
      assert.equal((await fix).deviceId, 'spare');
      let peers = await (await call('/devices/connected/host')).json(); assert.ok(peers.devices.find((d) => d.deviceId === 'spare').locationUpdatedAt);
      assert.equal(peers.devices.some((d) => 'ownerId' in d || 'connectionCode' in d), false);
      assert.equal((await call('/devices/sharing', { deviceId: 'spare', sharingEnabled: false }, 'spare')).status, 200);
      peers = await (await call('/devices/connected/host')).json(); assert.equal(peers.devices.find((d) => d.deviceId === 'spare').location, null);
      assert.equal(leaked, false);
    });
    const nextEvent = (socket, event, predicate) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => { socket.off(event, listener); reject(new Error(`Missing ${event}`)); }, 10000);
      const listener = (data) => { if (!predicate(data)) return; clearTimeout(timer); socket.off(event, listener); resolve(data); };
      socket.on(event, listener);
    });
    await t.test('range alerts persist once per excursion and hide distant coordinates over HTTP and sockets', async () => {
      const deviceService = require('../src/services/deviceService');
      const { updateRangeAlerts } = require('../src/services/mobileRangeService');
      const host = activeSockets.get('host'), spare = activeSockets.get('spare');
      const offline = nextEvent(host, 'device-status', (data) => data.deviceId === 'spare' && data.status === 'offline');
      spare.disconnect(); await offline;
      const moving = await connect('spare', 'spare');
      await deviceService.setLocationSharing('spare', true);
      await deviceService.updateDeviceLocation('host', 12.97, 77.59, 10);
      const warning = nextEvent(host, 'notification', (data) => data.notification.kind === 'out-of-range');
      const hidden = nextEvent(host, 'device-location-unavailable', (data) => data.deviceId === 'spare');
      let leakedFarLocation = false;
      const watchLocations = (fix) => { if (fix.deviceId === 'spare' && fix.latitude > 13) leakedFarLocation = true; };
      host.on('device-location', watchLocations);
      moving.emit('device-location', { deviceId: 'spare', latitude: 13.07, longitude: 77.59, accuracy: 10 });
      assert.equal((await hidden).rangeState, 'out-of-range');
      assert.match((await warning).notification.body, /1 km.*Please contact/);
      const peers = (await (await call('/devices/connected/host')).json()).devices;
      const far = peers.find((device) => device.deviceId === 'spare');
      assert.equal(far.location, null); assert.equal(far.rangeState, 'out-of-range'); assert.ok(far.distanceMeters > 10000);
      const nearby = await (await call('/devices/nearby?deviceId=host&latitude=12.97&longitude=77.59&radius=20000')).json();
      assert.equal(nearby.devices.some((device) => device.deviceId === 'spare'), false, 'A larger search radius must not bypass the connection range');
      assert.equal((await deviceService.getConnectedDevices('spare')).find((device) => device.deviceId === 'host').location, null);
      await Promise.all([updateRangeAlerts('host'), updateRangeAlerts('spare'), updateRangeAlerts('host')]);
      const rangeNotes = async () => (await (await call('/notifications/device/host')).json()).notifications.filter((note) => note.kind === 'out-of-range');
      assert.equal((await rangeNotes()).length, 1);
      await deviceService.updateDeviceLocation('spare', 12.9701, 77.59, 10);
      assert.ok((await deviceService.getConnectedDevices('host')).find((device) => device.deviceId === 'spare').location);
      assert.equal((await service.getDeviceConnections('spare')).find((link) => link.status === 'accepted').outOfRangeSince, null);
      await deviceService.updateDeviceLocation('spare', 13.07, 77.59, 10);
      assert.equal((await rangeNotes()).length, 2, 'A new excursion creates a new alert');
      assert.equal(leakedFarLocation, false); host.off('device-location', watchLocations);
      await deviceService.updateDeviceLocation('spare', 12.9701, 77.59, 10);
      await deviceService.updateDeviceLocation('host', 13.07, 77.59, 10);
      assert.equal((await rangeNotes()).length, 3, 'Moving the host also evaluates range');
      await db.pool.query("UPDATE devices SET location_updated_at = NOW() - INTERVAL '2 minutes' WHERE device_id='spare'");
      await updateRangeAlerts('host'); assert.equal((await rangeNotes()).length, 3, 'Stale GPS must not create more alerts');
      assert.equal((await deviceService.getConnectedDevices('host')).find((device) => device.deviceId === 'spare').rangeState, 'unavailable');
    });
    await t.test('host searching notifications survive an offline member and read state is isolated by device', async () => {
      const host = activeSockets.get('host'), spare = activeSockets.get('spare');
      const offline = nextEvent(host, 'device-status', (data) => data.deviceId === 'spare' && data.status === 'offline');
      spare.disconnect(); await offline;
      const response = await call('/connections/ring', { deviceId: 'host', targetDeviceId: 'spare' });
      assert.equal(response.status, 200); assert.equal((await response.json()).delivered, false);
      const inbox = await (await call('/notifications/device/spare', undefined, 'spare')).json();
      const notification = inbox.notifications.find((note) => note.kind === 'host-searching');
      assert.equal(notification.title, 'Your host is searching for you'); assert.equal(notification.readAt, null);
      assert.equal((await call('/notifications/read', { deviceId: 'spare', ids: [notification.id] }, 'host')).status, 403);
      assert.equal((await call('/notifications/read', { deviceId: 'host', ids: [notification.id] })).status, 200);
      assert.equal((await (await call('/notifications/device/spare', undefined, 'spare')).json()).unreadCount, inbox.unreadCount);
      assert.equal((await call('/notifications/read', { deviceId: 'spare', ids: [notification.id] }, 'spare')).status, 200);
      const read = await (await call('/notifications/device/spare', undefined, 'spare')).json();
      assert.ok(read.notifications.find((note) => note.id === notification.id).readAt);
      assert.equal(read.unreadCount, inbox.unreadCount - 1);
    });
    await t.test('verification can be disabled for HTTP and sockets without removing ownership checks', async () => {
      process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
      try {
        const response = await call('/devices/register', { deviceId: 'unverified-phone', deviceName: 'Test phone', ownerId: 'host' }, 'unverified');
        assert.equal(response.status, 201);
        assert.equal((await response.json()).device.ownerId, 'unverified');
        assert.equal((await call('/devices/unverified-phone', undefined, 'unverified')).status, 200);
        assert.equal((await call('/devices/host', undefined, 'unverified')).status, 403);
        assert.equal((await call('/devices/unverified-phone', undefined, null)).status, 401);
        const socket = await connect('unverified', 'unverified-phone');
        socket.disconnect();
        await assert.rejects(connect('unverified', 'host'), /Register this device/);
      } finally { process.env.REQUIRE_EMAIL_VERIFICATION = 'true'; }
      assert.equal((await call('/devices/unverified-phone', undefined, 'unverified')).status, 403);
    });
    await t.test('invitation guessing is throttled per verified account', async () => {
      let response;
      for (let attempt = 0; attempt < 21; attempt++) response = await call('/connections/preview?deviceId=lonely&code=00000000', undefined, 'lonely');
      assert.equal(response.status, 429);
      assert.equal(response.headers.get('retry-after'), '60');
    });
  } finally {
    for (const socket of sockets) socket.disconnect();
    if (appServer) await new Promise((resolve) => appServer.io.close(resolve));
    await require('../src/sockets/socketHandler').drain();
    await db.closeDatabase();
    await setup.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await setup.end();
  }
});
