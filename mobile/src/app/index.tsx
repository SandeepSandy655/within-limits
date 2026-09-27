import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import {
  startLiveLocation,
  stopLiveLocation,
} from "../services/locationService";
import {
  connectSocket,
  disconnectSocket,
} from "../services/socketService";
import {
  formatConnectionCode,
  getDeviceProfile,
  saveDeviceProfile,
} from "../services/deviceStorage";
import { registerDevice } from "../services/deviceService";

export default function HomeScreen() {
  const router = useRouter();

  const [deviceName, setDeviceName] = useState("");
  const [connectionCode, setConnectionCode] = useState("");
  const [status, setStatus] = useState("Starting...");
  const [socketStatus, setSocketStatus] = useState("Connecting...");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function startDevice() {
      try {
        const deviceProfile = await getDeviceProfile();

        if (mounted) {
          setDeviceName(deviceProfile.deviceName);
          setConnectionCode(deviceProfile.connectionCode || "");
          setStatus("Registering device...");
        }

        const registeredDevice = await registerDevice({
          deviceId: deviceProfile.deviceId,
          deviceName: deviceProfile.deviceName,
          deviceType: deviceProfile.deviceType,
          platform: deviceProfile.platform,
        });

        const nextProfile = {
          ...deviceProfile,
          connectionCode: registeredDevice.connectionCode,
          deviceName:
            registeredDevice.deviceName || deviceProfile.deviceName,
        };

        await saveDeviceProfile(nextProfile);

        if (mounted) {
          setDeviceName(nextProfile.deviceName);
          setConnectionCode(nextProfile.connectionCode || "");
          setStatus("Device registered");
        }

        const socket = connectSocket(deviceProfile.deviceId);

        const handleConnect = () => {
          if (mounted) {
            setSocketStatus("Connected");
          }
        };

        const handleConnectError = () => {
          if (mounted) {
            setSocketStatus("Connection failed");
          }
        };

        const handleDisconnect = () => {
          if (mounted) {
            setSocketStatus("Disconnected");
          }
        };

        socket.on("connect", handleConnect);
        socket.on("connect_error", handleConnectError);
        socket.on("disconnect", handleDisconnect);

        if (socket.connected) {
          handleConnect();
        }

        const handleConnectionRequest = (data: any) => {
          const connection = data?.connection;
          if (!connection) {
            return;
          }

          const requesterName =
            connection.requesterName || connection.requesterId;

          Alert.alert(
            "New Connection Request",
            `${requesterName} wants to connect`,
            [
              {
                text: "View",
                onPress: () => router.push("/requests"),
              },
            ]
          );
        };

        const handleConnectionAccepted = (data: any) => {
          const connection = data?.connection;
          if (!connection) {
            return;
          }

          const otherName =
            connection.requesterId === deviceProfile.deviceId
              ? connection.receiverName || connection.receiverId
              : connection.requesterName || connection.requesterId;

          Alert.alert(
            "Connected",
            `${otherName} is now paired with this device.`
          );
        };

        const handleConnectionRejected = (data: any) => {
          const connection = data?.connection;
          if (!connection) {
            return;
          }

          Alert.alert(
            "Request Rejected",
            "The connection request was rejected."
          );
        };

        socket.on("connection-request", handleConnectionRequest);
        socket.on("connection-accepted", handleConnectionAccepted);
        socket.on("connection-rejected", handleConnectionRejected);

        try {
          if (mounted) {
            setStatus("Starting optional location...");
          }

          await startLiveLocation(deviceProfile.deviceId);

          if (mounted) {
            setStatus("Ready");
          }
        } catch (locationError) {
          console.log("[HOME] Location skipped:", locationError);

          if (mounted) {
            setStatus("Ready");
          }
        }

        if (mounted) {
          setLoading(false);
        }
      } catch (error) {
        console.error("[HOME] STARTUP ERROR", error);

        if (mounted) {
          setStatus("Device startup failed");
          setSocketStatus("Not connected");
          setLoading(false);

          Alert.alert(
            "Device Startup Failed",
            error instanceof Error
              ? error.message
              : "Something went wrong while starting the device."
          );
        }
      }
    }

    startDevice();

    return () => {
      mounted = false;
      disconnectSocket();
      stopLiveLocation();
    };
  }, [router]);

  return (
    <View style={styles.container}>
      <Text style={styles.appTitle}>SAND</Text>

      <View style={styles.card}>
        <Text style={styles.deviceName}>
          {deviceName || "Generating..."}
        </Text>

        <Text style={styles.codeLabel}>Your Connection Code</Text>

        <Text style={styles.code}>
          {formatConnectionCode(connectionCode)}
        </Text>

        <Text style={styles.codeHint}>
          Share this code so another device can pair with you.
        </Text>

        <View style={styles.socketRow}>
          <View
            style={[
              styles.socketDot,
              socketStatus === "Connected"
                ? styles.connectedDot
                : styles.disconnectedDot,
            ]}
          />
          <Text style={styles.socketText}>Server: {socketStatus}</Text>
        </View>

        <Text style={styles.status}>{status}</Text>

        {loading && (
          <ActivityIndicator size="large" style={styles.loader} />
        )}

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push("/connect")}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryButtonText}>Connect Device</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push("/connections")}
          activeOpacity={0.8}
        >
          <Text style={styles.secondaryButtonText}>My Connections</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push("/requests")}
          activeOpacity={0.8}
        >
          <Text style={styles.secondaryButtonText}>
            Connection Requests
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push("/nearby")}
          activeOpacity={0.8}
        >
          <Text style={styles.nearbyLink}>Nearby Devices (optional)</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f7fa",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  appTitle: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 4,
    marginBottom: 20,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 25,
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  deviceName: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 18,
    textAlign: "center",
  },
  codeLabel: {
    fontSize: 14,
    color: "#777",
    marginBottom: 8,
  },
  code: {
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: 3,
    marginBottom: 8,
  },
  codeHint: {
    color: "#777",
    textAlign: "center",
    marginBottom: 18,
    lineHeight: 20,
  },
  socketRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  socketDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginRight: 8,
  },
  connectedDot: {
    backgroundColor: "#22c55e",
  },
  disconnectedDot: {
    backgroundColor: "#ef4444",
  },
  socketText: {
    fontSize: 14,
    color: "#555",
  },
  status: {
    fontSize: 13,
    color: "#888",
    marginTop: 8,
  },
  loader: {
    marginTop: 20,
  },
  primaryButton: {
    backgroundColor: "#111827",
    paddingVertical: 15,
    borderRadius: 12,
    marginTop: 22,
    width: "100%",
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    backgroundColor: "#EEF2FF",
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 10,
    width: "100%",
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "700",
  },
  nearbyLink: {
    marginTop: 18,
    color: "#6B7280",
    fontSize: 13,
  },
});
