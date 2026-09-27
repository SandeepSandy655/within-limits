import * as Location from "expo-location";
import { io, Socket } from "socket.io-client";

// CHANGE THIS to your computer's local IP address
const SERVER_URL = "http://192.168.1.11:5000";

export interface DeviceLocation {
  deviceId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
}

let socket: Socket | null = null;
let locationSubscription: Location.LocationSubscription | null = null;

export async function startLiveLocation(
  deviceId: string
): Promise<void> {
  try {
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

    socket = io(SERVER_URL, {
      transports: ["polling", "websocket"],
    });

    socket.on("connect", () => {
      console.log("Connected to backend");
      console.log("Socket ID:", socket?.id);

      // Tell backend this device is online
      socket?.emit("device-online", {
        deviceId,
      });
    });

    socket.on("connect_error", (error) => {
      console.log(
        "Socket connection error:",
        error.message
      );
    });

    socket.on("disconnect", (reason) => {
      console.log(
        "Disconnected from backend:",
        reason
      );
    });

    // --------------------------------------------------
    // 3. Start watching real GPS location
    // --------------------------------------------------

    locationSubscription =
      await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,

          // Try to get a location update every 5 seconds
          timeInterval: 5000,

          // Update when device moves at least 5 meters
          distanceInterval: 5,
        },

        (location) => {
          const {
            latitude,
            longitude,
            accuracy,
            speed,
            heading,
          } = location.coords;

          console.log("");
          console.log("===== REAL GPS LOCATION =====");
          console.log("Device:", deviceId);
          console.log("Latitude:", latitude);
          console.log("Longitude:", longitude);
          console.log("Accuracy:", accuracy);
          console.log("Speed:", speed);
          console.log("Heading:", heading);
          console.log("=============================");

          const locationData: DeviceLocation = {
            deviceId,
            latitude,
            longitude,
            accuracy: accuracy ?? null,
            speed: speed ?? null,
            heading: heading ?? null,
          };

          // Send GPS location to backend
          socket?.emit(
            "device-location",
            locationData
          );
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
  console.log("Stopping live location...");

  // Stop GPS watcher
  if (locationSubscription) {
    locationSubscription.remove();
    locationSubscription = null;
  }

  // Disconnect Socket.IO
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  console.log("Live location stopped");
}