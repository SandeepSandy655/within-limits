const test = require("node:test");
const assert = require("node:assert/strict");
const { orderedProgress } = require("../src/services/tripLifecycle");

test("completion follows checkpoint observation order, including delayed reports and second-resolution ties", () => {
  const checkpoints = ["entrance", "middle", "exit"].map((id) => ({ id }));
  const report = (checkpointId, seconds) => ({ checkpointId, observedAt: new Date(1700000000000 + seconds * 1000).toISOString() });
  assert.equal(orderedProgress(checkpoints, [report("exit", 3), report("entrance", 1)]).completedAt, null);
  assert.equal(orderedProgress(checkpoints, [report("exit", 3), report("entrance", 1), report("middle", 2)]).completedAt, report("exit", 3).observedAt);
  assert.equal(orderedProgress(checkpoints, [report("entrance", 1), report("exit", 2), report("middle", 3)]).completedAt, null);
  assert.equal(orderedProgress(checkpoints, [report("entrance", 1), report("exit", 2), report("middle", 3), report("exit", 4)]).completedAt, report("exit", 4).observedAt);
  assert.equal(orderedProgress(checkpoints, [report("exit", 1), report("middle", 1), report("entrance", 1)]).visited, 3);
});
