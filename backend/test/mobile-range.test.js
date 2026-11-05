const test = require('node:test');
const assert = require('node:assert/strict');
const { requireConnectionRange, assessConnectionRange } = require('../src/services/mobileRange');
const now = Date.now();
const phone = (meters = 0, extra = {}) => ({ location: { coordinates: [0, meters / 6371000 * 180 / Math.PI] },
  status: 'online', sharingEnabled: true, accuracy: 10, locationUpdatedAt: new Date(now).toISOString(), ...extra });

test('approval requires the host to select one of the supported ranges', () => {
  for (const meters of [1000, 2000]) assert.equal(requireConnectionRange(meters), meters);
  for (const meters of [undefined, null, 0, -1, 5000, 10000, '1000', true, NaN]) assert.throws(() => requireConnectionRange(meters), /Choose a connection range/);
});

test('the host-selected radius hides a device 10 km away in both directions', () => {
  assert.equal(assessConnectionRange(phone(), phone(900), 1000, now).rangeState, 'within-range');
  assert.equal(assessConnectionRange(phone(), phone(1500), 1000, now).rangeState, 'out-of-range');
  assert.equal(assessConnectionRange(phone(), phone(1500), 2000, now).rangeState, 'within-range');
  for (const range of [1000, 2000]) {
    assert.equal(assessConnectionRange(phone(), phone(10000), range, now).rangeState, 'out-of-range');
    assert.equal(assessConnectionRange(phone(10000), phone(), range, now).rangeState, 'out-of-range');
  }
  assert.equal(assessConnectionRange(phone(10000), phone(10100), 1000, now).rangeState, 'within-range');
});

test('unreliable, paused or stale GPS cannot establish range or trigger a distance alert', () => {
  const invalid = [
    { status: 'offline' }, { sharingEnabled: false }, { accuracy: null }, { accuracy: -1 }, { accuracy: 101 },
    { locationUpdatedAt: null }, { locationUpdatedAt: 'invalid' },
    { locationUpdatedAt: new Date(now - 90001).toISOString() }, { locationUpdatedAt: new Date(now + 1).toISOString() },
    { location: null }, { location: { coordinates: [0, 91] } }, { location: { coordinates: [181, 0] } },
    { location: { coordinates: [null, 0] } }, { location: { coordinates: ['0', 0] } },
  ];
  for (const extra of invalid) {
    const result = assessConnectionRange(phone(), phone(10000, extra), 1000, now);
    assert.equal(result.rangeState, 'unavailable', JSON.stringify(extra));
    assert.equal(result.distanceMeters, null);
    assert.equal(assessConnectionRange(phone(10000, extra), phone(), 1000, now).rangeState, 'unavailable');
  }
});
