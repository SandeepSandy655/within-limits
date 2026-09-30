import * as Location from "expo-location";
import { getSocket, connectSocket } from "./socketService";

export interface DeviceLocation {
  deviceId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
}

let locationSubscription: Location.LocationSubscription | null = null;
let lastSentAt = 0;
let lastSentCoordinates: { latitude: number; longitude: number } | null = null;

function distanceMeters(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number }
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(first.latitude)) *
      Math.cos(radians(second.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export async function startLiveLocation(
  deviceId: string
): Promise<void> {
  try {
    if (locationSubscription) return;
    lastSentAt = 0;
    lastSentCoordinates = null;
    console.log("=================================");
    console.log("STARTING LIVE LOCATION");
    console.log("Device ID:", deviceId);
    console.log("=================================");

    // --------------------------------------------------
    // 1. Request location permission
    // --------------------------------------------------

    const { status } =
      await Location.requestForegroundPermissionsAsync();

    if (status !== Location.PermissionStatus.GRANTED) {
      console.log("Location permission denied");
      return;
    }

    console.log("Location permission granted");

    // --------------------------------------------------
    // 2. Connect to Node.js backend
    // --------------------------------------------------

    connectSocket(deviceId);

    // --------------------------------------------------
    // 3. Start watching real GPS location
    // --------------------------------------------------

    locationSubscription =
      await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 10_000,
          distanceInterval: 10,
        },

        (location) => {
          const {
            latitude,
            longitude,
            accuracy,
            speed,
            heading,
          } = location.coords;

          const now = Date.now();
          const currentCoordinates = { latitude, longitude };
          const movedMeters = lastSentCoordinates
            ? distanceMeters(lastSentCoordinates, currentCoordinates)
            : Number.POSITIVE_INFINITY;
          const elapsedMs = now - lastSentAt;

          // Limit routine updates to one every 15 seconds. Send sooner after
          // meaningful movement, but never more often than every 5 seconds.
          if (
            lastSentAt > 0 &&
            (elapsedMs < 5_000 || (elapsedMs < 15_000 && movedMeters < 20))
          ) return;

          const locationData: DeviceLocation = {
            deviceId,
            latitude,
            longitude,
            accuracy: accuracy ?? null,
            speed: speed ?? null,
            heading: heading ?? null,
          };

          // Send GPS location to backend
          getSocket()?.emit(
            "device-location",
            locationData
          );
          lastSentAt = now;
          lastSentCoordinates = currentCoordinates;
        }
      );

    console.log("GPS tracking started");
  } catch (error) {
    console.error(
      "Failed to start live location:",
      error
    );
  }
}

export function stopLiveLocation(): void {
  if (locationSubscription) {
    locationSubscription.remove();
    locationSubscription = null;
  }

  lastSentAt = 0;
  lastSentCoordinates = null;
}
