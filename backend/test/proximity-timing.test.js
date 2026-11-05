const test = require("node:test");
const assert = require("node:assert/strict");
const { nextOutOfRangeSince, proximityAlert } = require("../src/services/proximityTiming");
const start = Date.parse("2026-11-05T12:00:00Z");
const at = (ms) => new Date(start + ms);
const monitor = { member_id: "a", assigned_at: at(-1000), out_of_range_since: at(0) };
const previous = (ms, state = "far") => ({ state, observed_at: at(ms), received_at: at(ms) });
const report = (ms, state = "far") => ({ state, observedAt: at(ms).toISOString() });

test("a continuous far/lost episode alerts at two minutes, independently of the buzzer", () => {
  let active = { ...monitor, out_of_range_since: null }, last;
  for (let ms = 0; ms <= 120000; ms += 10000) {
    const state = ms < 60000 ? "far" : "lost";
    active.out_of_range_since = nextOutOfRangeSince(active, last, report(ms, state), start + ms);
    last = previous(ms, state);
    const row = { online: true, assignmentFresh: true, groupId: "g", memberId: "a", state, outOfRangeSince: active.out_of_range_since, buzzerEnabled: false };
    assert.equal(proximityAlert(row, start + ms), ms >= 120000);
  }
  assert.equal(active.out_of_range_since.getTime(), start);
});
test("recovery, gaps, delayed uploads and new assignments reset the timer", () => {
  assert.equal(nextOutOfRangeSince(monitor, previous(10000), report(20000, "near"), start + 20000), null);
  assert.equal(nextOutOfRangeSince(monitor, previous(10000), report(20000, "waiting"), start + 20000), null);
  assert.equal(nextOutOfRangeSince(monitor, previous(10000), report(50000), start + 50000).getTime(), start + 50000);
  assert.equal(nextOutOfRangeSince(monitor, previous(10000), report(20000), start + 80000), null);
  assert.equal(nextOutOfRangeSince({ ...monitor, member_id: null }, previous(10000), report(20000), start + 20000), null);
  const relinked = { ...monitor, out_of_range_since: null, assigned_at: at(15000) };
  assert.equal(nextOutOfRangeSince(relinked, previous(10000), report(20000), start + 20000).getTime(), start + 20000);
  assert.equal(nextOutOfRangeSince(relinked, previous(10000), report(10000), start + 20000), null);
});
test("out-of-order reports cannot extend the episode or hide a late recovery", () => {
  assert.equal(nextOutOfRangeSince(monitor, previous(20000), report(-10000), start + 30000).getTime(), start);
  assert.equal(nextOutOfRangeSince(monitor, previous(20000), report(10000, "near"), start + 30000), null);
});
test("stale, unassigned and unconfirmed members cannot generate proximity alerts", () => {
  const row = { online: true, assignmentFresh: true, groupId: "g", memberId: "a", state: "far", outOfRangeSince: at(0) };
  assert.equal(proximityAlert(row, start + 119999), false);
  assert.equal(proximityAlert(row, start + 120000), true);
  for (const change of [{ online: false }, { assignmentFresh: false }, { groupId: null }, { memberId: null }, { outOfRangeSince: null }, { state: "near" }]) {
    assert.equal(proximityAlert({ ...row, ...change }, start + 130000), false);
  }
});
