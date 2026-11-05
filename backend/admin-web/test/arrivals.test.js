import test from "node:test";
import assert from "node:assert/strict";
import { latestArrivals } from "../src/arrivals.js";

test("arrivals show named, timestamped visits only for the selected route", () => {
  const route = { id: "route-a", checkpoints: [{ id: "entrance", name: "Entrance" }, { id: "exit", name: "Exit" }] };
  const groups = [{ id: "a", routeId: route.id, name: "RFID group", members: [
    { id: "one", name: "Person 1", checkpointId: "entrance", lastSeen: "2026-11-04T12:00:00Z" },
    { id: "two", name: "Person 2", checkpointId: "exit", lastSeen: "2026-11-04T12:01:00Z" },
    { id: "waiting", name: "Waiting", checkpointId: null, lastSeen: null },
    { id: "missing", name: "Missing checkpoint", checkpointId: "deleted", lastSeen: "2026-11-04T12:02:00Z" },
    { id: "invalid", name: "Invalid time", checkpointId: "entrance", lastSeen: "invalid" },
  ] }, { id: "other", routeId: "route-b", name: "Other route", members: [
    { id: "outside", name: "Outside", checkpointId: "entrance", lastSeen: "2026-11-04T13:00:00Z" },
  ] }];
  const arrivals = latestArrivals(route, groups);
  assert.deepEqual(arrivals.map((item) => item.memberName), ["Person 2", "Person 1"]);
  assert.equal(arrivals[1].checkpointName, "Entrance");
  assert.equal(arrivals[1].observedAt, "2026-11-04T12:00:00Z");
  assert.equal(arrivals[1].groupName, "RFID group");
  assert.equal(latestArrivals(route, groups, 1).length, 1);
  assert.deepEqual(latestArrivals(null, groups), []);
});

test("trip updates keep exited history separate from active re-entry and identify incomplete exits", () => {
  const route = { id: "route", autoEnroll: true, checkpoints: [{ id: "entrance", name: "Entrance" }, { id: "exit", name: "Exit" }] };
  const groups = [{ id: "group", routeId: "route", name: "RFID trips", members: [
    { id: "new-trip", name: "Person 2", checkpointId: "entrance", tripStartedAt: "2026-11-04T12:01:00Z", lastSeen: "2026-11-04T12:01:00Z" },
    { id: "incomplete", name: "Person 3", checkpointId: "exit", lastSeen: "2026-11-04T12:02:00Z" },
    { id: "old-trip", name: "Person 1", checkpointId: "exit", lastSeen: "2026-11-04T12:00:00Z" },
  ] }];
  const completed = [
    { memberId: "old-trip", memberName: "Person 1", routeId: "route", checkpointId: "exit", checkpointName: "Exit", exitedAt: "2026-11-04T12:00:00Z" },
    { memberId: "foreign", memberName: "Other route", routeId: "other", exitedAt: "2026-11-04T12:03:00Z" },
  ];
  const updates = latestArrivals(route, groups, 8, completed);
  assert.equal(updates.length, 3);
  assert.equal(updates[0].incompleteExit, true);
  assert.equal(updates[1].registered, true);
  assert.equal(updates[2].exited, true);
  assert.equal(updates[2].memberName, "Person 1");
  assert.equal(latestArrivals(route, [], 8, completed).length, 1);
});
