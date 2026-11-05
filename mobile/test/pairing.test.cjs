const test = require('node:test');
const assert = require('node:assert/strict');
test('QR parsing accepts exact invitations and rejects unrelated links', async () => {
  const { parsePairingCode, invitationLink } = await import('../src/services/pairing.ts');
  for (const value of ['12345678', '1234 5678', '1234-5678', invitationLink('12345678')]) assert.equal(parsePairingCode(value), '12345678');
  for (const value of ['garbage12345678', 'https://example.com/12345678', '1234567', '123456789', 'withinlimits://other?code=12345678', 'withinlimits://connect?code=1234567']) assert.equal(parsePairingCode(value), null);
});
test('missing, stale and invalid timestamps never show a live position', async () => {
  const { locationFreshness, distanceMeters } = await import('../src/services/locationFormat.ts');
  const now = Date.now();
  assert.equal(locationFreshness(null, now), 'Waiting for GPS');
  assert.equal(locationFreshness('invalid', now), 'Waiting for GPS');
  assert.equal(locationFreshness(new Date(now - 120000).toISOString(), now), 'Last known location');
  assert.equal(locationFreshness(new Date(now - 1000).toISOString(), now), 'Live location');
  assert.equal(locationFreshness(new Date(now - 1000).toISOString(), now, false), 'Last known location');
  assert.equal(locationFreshness(new Date(now + 1000).toISOString(), now), 'Last known location');
  assert.equal(distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 }), 0);
  assert.ok(Math.abs(distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 }) - 111195) < 1);
});
