const CONNECTION_RANGES_METERS = [1000, 2000];
const LOCATION_MAX_AGE_MS = 90_000;
const LOCATION_MAX_ACCURACY_METERS = 100;

function requireConnectionRange(value) {
  if (!CONNECTION_RANGES_METERS.includes(value)) {
    throw new Error("Choose a connection range of 1 km or 2 km before approving.");
  }
  return value;
}

function freshPoint(device, now) {
  const coordinates = device?.location?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length !== 2) return null;
  const [longitude, latitude] = coordinates;
  const age = device.locationUpdatedAt ? now - new Date(device.locationUpdatedAt).getTime() : NaN;
  if (device.sharingEnabled !== true || device.status !== "online"
    || !Number.isFinite(longitude) || Math.abs(longitude) > 180
    || !Number.isFinite(latitude) || Math.abs(latitude) > 90
    || !Number.isFinite(age) || age < 0 || age > LOCATION_MAX_AGE_MS
    || !Number.isFinite(device.accuracy) || device.accuracy < 0 || device.accuracy > LOCATION_MAX_ACCURACY_METERS) return null;
  return { latitude, longitude };
}

function distanceMeters(first, second) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const a = Math.sin(radians(second.latitude - first.latitude) / 2) ** 2
    + Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude))
    * Math.sin(radians(second.longitude - first.longitude) / 2) ** 2;
  const bounded = Math.min(1, Math.max(0, a));
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(bounded), Math.sqrt(1 - bounded));
}

function assessConnectionRange(first, second, rangeMeters, now = Date.now()) {
  const range = requireConnectionRange(rangeMeters);
  const start = freshPoint(first, now), end = freshPoint(second, now);
  if (!start || !end) return { rangeState: "unavailable", distanceMeters: null, rangeMeters: range };
  const distance = distanceMeters(start, end);
  return { rangeState: distance > range ? "out-of-range" : "within-range", distanceMeters: distance, rangeMeters: range };
}

module.exports = { CONNECTION_RANGES_METERS, requireConnectionRange, assessConnectionRange, distanceMeters };
