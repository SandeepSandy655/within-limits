import test from "node:test";
import assert from "node:assert/strict";
import { groupProximity, groupAlerts } from "../src/proximitySummary.js";

const now = Date.parse("2026-11-04T17:00:00Z");
const group = { id: "group", routeId: "route", members: [{ id: "a", name: "Person 1" }, { id: "b", name: "Person 2" }] };
const monitor = (memberId, extra = {}) => ({ id: `board-${memberId}`, memberId, groupId: group.id, routeId: group.routeId, status: "near", online: true, assignmentFresh: true, observedAt: new Date(now).toISOString(), receivedAt: new Date(now).toISOString(), ...extra });

test("everyone nearby requires a fresh linked report for every active member", () => {
  assert.equal(groupProximity(group, [], now).together, false);
  const partial = groupProximity(group, [monitor("a")], now);
  assert.equal(partial.near, 1); assert.equal(partial.unknown, 1); assert.equal(partial.together, false);
  const complete = groupProximity(group, [monitor("a"), monitor("b")], now);
  assert.equal(complete.together, true); assert.equal(complete.mood, "together");
  assert.equal(groupProximity({ ...group, members: [] }, [], now).together, false);
});
test("old assignments, offline snapshots and foreign groups never confirm presence", () => {
  for(const extra of [{ assignmentFresh: false }, { online: false }, { receivedAt: new Date(now - 31000).toISOString() }, { observedAt: new Date(now - 31000).toISOString() }, { observedAt: "invalid" }, { groupId: "other" }, { routeId: "other" }, { revokedAt: new Date(now).toISOString() }]) {
    const summary = groupProximity(group, [monitor("a"), monitor("b", extra)], now);
    assert.equal(summary.together, false); assert.equal(summary.near, 1);
  }
  assert.equal(groupProximity(group, [monitor("a"), monitor("b")], now + 31000).near, 0);
});
test("brief separation is monitored without raising a two-minute alert", () => {
  const summary = groupProximity(group, [monitor("a"), monitor("b", { status: "lost" })], now);
  assert.equal(summary.missing, 1); assert.equal(summary.mood, "pending");
  assert.equal(summary.alerts, 0);
  const weak = groupProximity(group, [monitor("a"), monitor("b", { status: "far" })], now);
  assert.equal(weak.together, false); assert.equal(weak.alerts, 0);
});
test("server-confirmed alerts work across groups and expire with stale reports", () => {
  const monitors = [monitor("a"), monitor("b", { status: "far", proximityAlert: true })];
  assert.equal(groupProximity(group, monitors, now).mood, "alert");
  assert.equal(groupAlerts([group], monitors, now)[0].member.id, "b");
  assert.deepEqual(groupAlerts([group], monitors, now + 31000), []);
  assert.deepEqual(groupAlerts([group], [monitor("b", { status: "near", proximityAlert: true })], now), []);
});
