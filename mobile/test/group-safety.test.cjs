const test = require('node:test');
const assert = require('node:assert/strict');

test('four total devices fill the host, pending requests reserve spaces and expired requests release them', async () => {
  const { groupCapacity } = await import('../src/services/pairing.ts');
  const now = Date.now();
  const connection = (requesterId, status = 'accepted', expiresAt = new Date(now + 10000).toISOString()) => ({
    _id: requesterId, requesterId, receiverId: 'host', status, expiresAt, createdAt: new Date(now).toISOString(), rangeMeters: 1000,
  });
  const links = [connection('a'), connection('b'), connection('c', 'pending')];
  const full = groupCapacity(links, 'host', now);
  assert.equal(full.full, true); assert.equal(full.occupied, 4); assert.equal(full.joined, 2); assert.equal(full.pending, 1);
  assert.equal(groupCapacity(links, 'host', now + 10001).full, false);
  assert.equal(groupCapacity(links, 'a', now).memberConnection.requesterId, 'a');
  assert.equal(groupCapacity(links, 'c', now).memberConnection.status, 'pending');
  assert.equal(groupCapacity(links, 'c', now + 10001).memberConnection, undefined);
});

test('Map and Nearby share range filtering and never retain a 10 km marker', async () => {
  const { visibleGroupDevices } = await import('../src/services/locationFormat.ts');
  const now = Date.now(), timestamp = new Date(now).toISOString();
  const self = { deviceId: 'host', latitude: 0, longitude: 0, accuracy: 10, timestamp };
  const peer = (id, meters, rangeMeters = 1000, extra = {}) => ({ deviceId: id, deviceName: id,
    location: { type: 'Point', coordinates: [0, meters / 6371000 * 180 / Math.PI] }, status: 'online',
    sharingEnabled: true, accuracy: 10, locationUpdatedAt: timestamp, rangeState: 'within-range', rangeMeters, ...extra });
  const peers = [peer('near', 500), peer('outside-one-km', 1500), peer('inside-two-km', 1500, 2000), peer('far', 10000, 2000)];
  assert.deepEqual(visibleGroupDevices(peers, self, true, now).map((item) => item.deviceId), ['near', 'inside-two-km']);
  assert.deepEqual(visibleGroupDevices(peers, { ...self, latitude: 0.2 }, true, now), [], 'Moving this device must remove old in-range markers immediately');
  assert.deepEqual(visibleGroupDevices(peers, null, true, now), []);
  assert.deepEqual(visibleGroupDevices(peers, self, false, now), []);
  assert.deepEqual(visibleGroupDevices(peers, { ...self, accuracy: null }, true, now), []);
  for (const extra of [{ status: 'offline' }, { sharingEnabled: false }, { location: null }, { rangeState: 'out-of-range' },
    { rangeState: 'unavailable' }, { accuracy: 150 }, { accuracy: -1 }, { accuracy: null },
    { locationUpdatedAt: new Date(now - 90001).toISOString() }, { locationUpdatedAt: new Date(now + 1).toISOString() }]) {
    assert.deepEqual(visibleGroupDevices([peer('hidden', 100, 1000, extra)], self, true, now), [], JSON.stringify(extra));
  }
});
