const { randomUUID } = require("node:crypto");

class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
function text(value, label, max = 100) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new InputError(`${label} must contain 1–${max} characters.`);
  return value.trim();
}
function id(value, label = "ID") {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new InputError(`${label} is invalid.`);
  return value.toLowerCase();
}
function point(value) {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite) || Math.abs(value[0]) > 90 || Math.abs(value[1]) > 180) throw new InputError("Choose valid latitude and longitude coordinates.");
  return value;
}
function routeInput(body = {}) {
  if (body.mapMode !== undefined && !["geographic", "schematic"].includes(body.mapMode)) throw new InputError("Choose a geographic map or a checkpoint layout.");
  if (body.autoEnroll !== undefined && typeof body.autoEnroll !== "boolean") throw new InputError("Automatic registration must be true or false.");
  const name = text(body.name, "Route name");
  const region = text(body.region, "Region");
  if (!Array.isArray(body.checkpoints) || body.checkpoints.length < 2 || body.checkpoints.length > 100) throw new InputError("Add between 2 and 100 checkpoints.");
  const checkpoints = body.checkpoints.map((cp) => {
    const [latitude, longitude] = point([cp?.latitude, cp?.longitude]);
    return { id: cp.id ? id(cp.id, "Checkpoint ID") : randomUUID(), name: text(cp.name, "Checkpoint name"), latitude, longitude };
  });
  if (new Set(checkpoints.map((cp) => cp.id)).size !== checkpoints.length) throw new InputError("Checkpoint IDs must be unique.");
  if (!Array.isArray(body.path) || body.path.length < 2 || body.path.length > 2000) throw new InputError("Draw a path with 2–2,000 points.");
  return { name, region, checkpoints, path: body.path.map(point), autoEnroll: body.autoEnroll, mapMode: body.mapMode };
}
function groupInput(body = {}) {
  if (!Array.isArray(body.members) || body.members.length < 1 || body.members.length > 100) throw new InputError("Add between 1 and 100 members with tracking codes.");
  const members = body.members.map((member) => ({ id: randomUUID(), name: text(member?.name, "Member name"), tagId: text(member?.tagId, "Tracking code", 128) }));
  if (new Set(members.map((member) => member.tagId)).size !== members.length) throw new InputError("Each member needs a different tracking code.");
  return { routeId: id(body.routeId, "Route ID"), name: text(body.name, "Group name"), leaderName: text(body.leaderName, "Leader name"), members };
}
function reportInput(body = {}, now = Date.now()) {
  const eventId = text(body.eventId, "eventId", 128);
  const tagId = text(body.tagId, "tagId", 128);
  if (typeof body.observedAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(body.observedAt)) throw new InputError("observedAt must be an ISO 8601 timestamp with a timezone.");
  const time = Date.parse(body.observedAt);
  if (!Number.isFinite(time) || time > now + 60_000 || time < now - 7 * 24 * 60 * 60_000) throw new InputError("observedAt must be within the last 7 days and no more than 60 seconds ahead.");
  if (["checkpointId", "groupId", "routeId", "latitude", "longitude", "location"].some((key) => key in body)) throw new InputError("Send only eventId, tagId and observedAt; checkpoint and group are assigned by the server.");
  return { eventId, tagId, observedAt: new Date(time).toISOString() };
}
module.exports = { InputError, text, id, routeInput, groupInput, reportInput };
