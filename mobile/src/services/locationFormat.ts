import type { Device } from './connectionService';
import type { DeviceLocation } from './locationService';

export function visibleGroupDevices(devices: Device[], location: DeviceLocation | null, online = true, now = Date.now()) {
  if (!location || !online || locationFreshness(location.timestamp, now, online) !== 'Live location'
    || location.accuracy == null || !Number.isFinite(location.accuracy) || location.accuracy < 0 || location.accuracy > 100
    || !Number.isFinite(location.latitude) || Math.abs(location.latitude) > 90
    || !Number.isFinite(location.longitude) || Math.abs(location.longitude) > 180) return [];
  return devices.flatMap((peer) => {
    const coordinates = peer.location?.coordinates;
    if (!coordinates || coordinates.length !== 2 || peer.sharingEnabled !== true
      || (peer.rangeState && peer.rangeState !== 'within-range')
      || peer.accuracy == null || !Number.isFinite(peer.accuracy) || peer.accuracy < 0 || peer.accuracy > 100
      || locationFreshness(peer.locationUpdatedAt, now, peer.status === 'online') !== 'Live location'
      || !Number.isFinite(coordinates[0]) || Math.abs(coordinates[0]) > 180
      || !Number.isFinite(coordinates[1]) || Math.abs(coordinates[1]) > 90) return [];
    const distance = distanceMeters(location, { latitude: coordinates[1], longitude: coordinates[0] });
    const range = peer.rangeMeters === 2000 ? 2000 : 1000;
    return distance <= range ? [{ ...peer, distance }] : [];
  }).sort((first, second) => first.distance - second.distance);
}

export function locationFreshness(timestamp?: string | null, now = Date.now(), online = true): string {
  const age = timestamp ? now - Date.parse(timestamp) : NaN;
  if (!Number.isFinite(age)) return 'Waiting for GPS';
  if (!online || age < 0 || age > 90_000) return 'Last known location';
  return 'Live location';
}
export function updatedLabel(timestamp?: string | null, now = Date.now()): string {
  const age = timestamp ? now - Date.parse(timestamp) : NaN;
  if (!Number.isFinite(age)) return 'No location yet';
  if (age < 60_000) return 'Updated just now';
  if (age < 3600_000) return `Updated ${Math.floor(age / 60_000)} min ago`;
  return `Updated ${new Date(timestamp!).toLocaleString()}`;
}
export function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = (n: number) => n * Math.PI / 180;
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
