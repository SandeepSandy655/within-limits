const test = require("node:test");
const assert = require("node:assert/strict");
const { reportInput, routeInput, groupInput } = require("../src/services/trackingValidation");
const { randomUUID } = require("node:crypto");
test("reports reject forged positions and invalid or stale timestamps", () => {
  const now = Date.now();
  const report = { eventId: "evt-1", tagId: "tag-a", observedAt: new Date(now).toISOString() };
  assert.equal(reportInput(report, now).tagId, "tag-a");
  for (const body of [{ ...report, location: {} }, { ...report, checkpointId: randomUUID() }, { ...report, observedAt: new Date(now + 120_000).toISOString() }, { ...report, observedAt: new Date(now - 8 * 86400_000).toISOString() }, { ...report, observedAt: "2026-11-04" }, { ...report, tagId: "" }]) assert.throws(() => reportInput(body, now));
});
test("routes reject malformed coordinates, missing paths and duplicate checkpoint IDs", () => {
  const cp = { id: randomUUID(), name: "Start", latitude: 12.9, longitude: 77.5 };
  const route = { name: "Trail", region: "Park", path: [[12.9, 77.5], [12.91, 77.51]], checkpoints: [cp, { ...cp, id: randomUUID(), name: "Finish" }] };
  assert.equal(routeInput(route).checkpoints.length, 2);
  assert.throws(() => routeInput({ ...route, path: [] }));
  assert.throws(() => routeInput({ ...route, checkpoints: [cp, cp] }));
  assert.throws(() => routeInput({ ...route, path: [[91, 77], [12, 77]] }));
  assert.throws(() => routeInput({ ...route, path: [["12", 77], [12, 77]] }));
  assert.equal(routeInput({ ...route, autoEnroll: true }).autoEnroll, true);
  assert.throws(() => routeInput({ ...route, autoEnroll: "true" }));
});
test("a tracked group needs unique tracking assignments", () => {
  const group = { name: "Group A", leaderName: "Leader", routeId: randomUUID(), members: [{ name: "One", tagId: "one" }] };
  assert.equal(groupInput(group).members.length, 1);
  assert.throws(() => groupInput({ ...group, members: [] }));
  assert.throws(() => groupInput({ ...group, members: [group.members[0], group.members[0]] }));
});
