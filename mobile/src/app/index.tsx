import { useEffect, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
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

  const [deviceName, setDeviceName] =
    useState("");
  const [savingName, setSavingName] = useState(false);

  const [connectionCode, setConnectionCode] =
    useState("");

  const [status, setStatus] =
    useState("Starting...");

  const [socketStatus, setSocketStatus] =
    useState("Connecting...");

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    let mounted = true;

    async function startDevice() {
      try {
        // ==========================================
        // 1. GET LOCAL DEVICE PROFILE
        // ==========================================

        console.log(
          "[HOME] Loading device profile..."
        );

        const deviceProfile =
          await getDeviceProfile();

        if (!deviceProfile) {
          throw new Error(
            "Device profile not found"
          );
        }

        console.log(
          "[HOME] Device name:",
          deviceProfile.deviceName
        );

        console.log(
          "[HOME] Device ID:",
          deviceProfile.deviceId
        );

        if (mounted) {
          setDeviceName(
            deviceProfile.deviceName
          );

          // Show locally stored code if available
          setConnectionCode(
            deviceProfile.connectionCode || ""
          );

          setStatus(
            "Registering device..."
          );
        }

        // ==========================================
        // 2. REGISTER DEVICE WITH BACKEND
        // ==========================================

        console.log(
          "[HOME] Registering device..."
        );

        const registeredDevice =
          await registerDevice({
            deviceId:
              deviceProfile.deviceId,

            deviceName:
              deviceProfile.deviceName,

            deviceType:
              deviceProfile.deviceType,

            platform:
              deviceProfile.platform,
          });

        console.log(
          "[HOME] Device registered:",
          registeredDevice
        );

        console.log(
          "[HOME] Connection Code:",
          registeredDevice.connectionCode
        );

        // ==========================================
        // 3. SAVE BACKEND DATA LOCALLY
        // ==========================================

        const updatedProfile = {
          ...deviceProfile,

          deviceName:
            registeredDevice.deviceName ||
            deviceProfile.deviceName,

          connectionCode:
            registeredDevice.connectionCode,
        };

        await saveDeviceProfile(
          updatedProfile
        );

        if (mounted) {
          setDeviceName(
            updatedProfile.deviceName
          );

          setConnectionCode(
            updatedProfile.connectionCode ||
              ""
          );

          setStatus(
            "Device registered"
          );
        }

        // ==========================================
        // 4. CONNECT SOCKET.IO
        // ==========================================

        console.log(
          "[HOME] Connecting Socket.IO..."
        );

        const socket = connectSocket(
          deviceProfile.deviceId
        );

        // ------------------------------------------
        // Socket connected
        // ------------------------------------------

        const handleConnect = () => {
          console.log(
            "[HOME] Socket connected:",
            socket.id
          );

          if (mounted) {
            setSocketStatus(
              "Connected"
            );
          }
        };

        // ------------------------------------------
        // Socket connection error
        // ------------------------------------------

        const handleConnectError = (
          error: Error
        ) => {
          console.log(
            "[HOME] Socket connection error:",
            error.message
          );

          if (mounted) {
            setSocketStatus(
              "Connection failed"
            );
          }
        };

        // ------------------------------------------
        // Socket disconnected
        // ------------------------------------------

        const handleDisconnect = (
          reason: string
        ) => {
          console.log(
            "[HOME] Socket disconnected:",
            reason
          );

          if (mounted) {
            setSocketStatus(
              "Disconnected"
            );
          }
        };

        socket.on(
          "connect",
          handleConnect
        );

        socket.on(
          "connect_error",
          handleConnectError
        );

        socket.on(
          "disconnect",
          handleDisconnect
        );

        // If socket was already connected
        if (socket.connected) {
          handleConnect();
        }

        // ==========================================
        // 5. INCOMING CONNECTION REQUEST
        // ==========================================

        const handleConnectionRequest = (
          data: any
        ) => {
          const connection =
            data?.connection;

          if (!connection) {
            return;
          }

          const requesterName =
            connection.requesterName ||
            connection.requesterId ||
            "Another device";

          Alert.alert(
            "New Connection Request",
            `${requesterName} wants to connect.`,
            [
              {
                text: "View Request",
                onPress: () => {
                  router.push(
                    "/requests"
                  );
                },
              },
              {
                text: "Later",
                style: "cancel",
              },
            ]
          );
        };

        socket.on(
          "connection-request",
          handleConnectionRequest
        );

        // ==========================================
        // 6. CONNECTION ACCEPTED
        // ==========================================

        const handleConnectionAccepted = (
          data: any
        ) => {
          const connection =
            data?.connection;

          if (!connection) {
            return;
          }

          const currentDeviceId =
            deviceProfile.deviceId;

          const otherName =
            connection.requesterId ===
            currentDeviceId
              ? connection.receiverName ||
                connection.receiverId
              : connection.requesterName ||
                connection.requesterId;

          Alert.alert(
            "Device Connected",
            `${otherName} is now paired with this device.`
          );
        };

        socket.on(
          "connection-accepted",
          handleConnectionAccepted
        );

        // ==========================================
        // 7. CONNECTION REJECTED
        // ==========================================

        const handleConnectionRejected = (
          data: any
        ) => {
          const connection =
            data?.connection;

          if (!connection) {
            return;
          }

          Alert.alert(
            "Request Rejected",
            "The connection request was rejected."
          );
        };

        socket.on(
          "connection-rejected",
          handleConnectionRejected
        );

        // ==========================================
        // 8. OPTIONAL GPS
        // ==========================================

        try {
          if (mounted) {
            setStatus(
              "Starting optional location..."
            );
          }

          console.log(
            "[HOME] Starting optional GPS..."
          );

          await startLiveLocation(
            deviceProfile.deviceId
          );

          console.log(
            "[HOME] Optional GPS started"
          );
        } catch (locationError) {
          console.log(
            "[HOME] Location skipped:",
            locationError
          );
        }

        // ==========================================
        // 9. DEVICE READY
        // ==========================================

        if (mounted) {
          setStatus("Ready");
          setLoading(false);
        }

        console.log(
          "================================="
        );

        console.log(
          "[HOME] DEVICE READY"
        );

        console.log(
          "[HOME] Name:",
          updatedProfile.deviceName
        );

        console.log(
          "[HOME] Connection Code:",
          updatedProfile.connectionCode
        );

        console.log(
          "================================="
        );
      } catch (error) {
        console.error(
          "[HOME] STARTUP ERROR:",
          error
        );

        if (mounted) {
          setStatus(
            "Device startup failed"
          );

          setSocketStatus(
            "Not connected"
          );

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

    // ==========================================
    // CLEANUP
    // ==========================================

    return () => {
      mounted = false;

      console.log(
        "[HOME] Cleaning up..."
      );

      disconnectSocket();

      stopLiveLocation();
    };
  }, [router]);

  // ==========================================
  // OPEN CONNECT DEVICE
  // ==========================================

  function openConnect() {
    router.push("/connect");
  }

  // ==========================================
  // OPEN CONNECTIONS
  // ==========================================

  function openConnections() {
    router.push("/connections");
  }

  function openSharedMap() {
    router.push("/locations");
  }

  // ==========================================
  // OPEN REQUESTS
  // ==========================================

  function openRequests() {
    router.push("/requests");
  }

  // ==========================================
  // OPEN OPTIONAL NEARBY
  // ==========================================

  function openNearby() {
    router.push("/nearby");
  }

  async function saveDeviceName() {
    const normalizedName = deviceName.trim();
    if (!normalizedName) {
      Alert.alert("Device name required", "Enter a name to identify this device.");
      return;
    }
    setSavingName(true);
    try {
      const profile = await getDeviceProfile();
      const registered = await registerDevice({ ...profile, deviceName: normalizedName });
      const updated = { ...profile, deviceName: registered.deviceName || normalizedName, connectionCode: registered.connectionCode };
      await saveDeviceProfile(updated);
      setDeviceName(updated.deviceName);
      Alert.alert("Saved", "This device name has been updated.");
    } catch (error) {
      Alert.alert("Could not save", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSavingName(false);
    }
  }

  // ==========================================
  // UI
  // ==========================================

  return (
    <View style={styles.container}>
      <Text style={styles.appTitle}>
        SAND
      </Text>

      <View style={styles.card}>
        {/* DEVICE NAME */}

        <Text style={styles.fieldLabel}>This device</Text>
        <TextInput
          accessibilityLabel="Device name"
          value={deviceName}
          onChangeText={setDeviceName}
          placeholder="Name this device"
          maxLength={32}
          style={styles.deviceNameInput}
          returnKeyType="done"
          onSubmitEditing={saveDeviceName}
        />
        <TouchableOpacity style={styles.renameButton} onPress={saveDeviceName} disabled={savingName || loading}>
          <Text style={styles.renameButtonText}>{savingName ? "Saving…" : "Save device name"}</Text>
        </TouchableOpacity>

        {/* CONNECTION CODE */}

        <Text style={styles.codeLabel}>
          Your Connection Code
        </Text>

        <Text style={styles.code}>
          {formatConnectionCode(
            connectionCode
          )}
        </Text>

        <Text style={styles.codeHint}>
          Share this code with another device
          to allow it to send you a pairing
          request.
        </Text>

        {/* SERVER STATUS */}

        <View style={styles.socketRow}>
          <View
            style={[
              styles.socketDot,

              socketStatus ===
              "Connected"
                ? styles.connectedDot
                : styles.disconnectedDot,
            ]}
          />

          <Text style={styles.socketText}>
            Server: {socketStatus}
          </Text>
        </View>

        {/* DEVICE STATUS */}

        <Text style={styles.status}>
          {status}
        </Text>

        {/* LOADING */}

        {loading && (
          <ActivityIndicator
            size="large"
            style={styles.loader}
          />
        )}

        {/* CONNECT DEVICE */}

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={openConnect}
          activeOpacity={0.8}
        >
          <Text
            style={styles.primaryButtonText}
          >
            Connect Device
          </Text>
        </TouchableOpacity>

        {/* MY CONNECTIONS */}

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={openConnections}
          activeOpacity={0.8}
        >
          <Text
            style={styles.secondaryButtonText}
          >
            My Connections
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={openSharedMap}
          activeOpacity={0.8}
        >
          <Text style={styles.secondaryButtonText}>Shared Map</Text>
        </TouchableOpacity>

        {/* CONNECTION REQUESTS */}

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={openRequests}
          activeOpacity={0.8}
        >
          <Text
            style={styles.secondaryButtonText}
          >
            Connection Requests
          </Text>
        </TouchableOpacity>

        {/* OPTIONAL NEARBY */}

        <TouchableOpacity
          onPress={openNearby}
          activeOpacity={0.8}
        >
          <Text style={styles.nearbyLink}>
            Nearby Devices (optional)
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ==========================================
// STYLES
// ==========================================

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

    shadowOffset: {
      width: 0,
      height: 4,
    },
  },

  deviceName: {
    fontSize: 24,

    fontWeight: "700",

    marginBottom: 18,

    textAlign: "center",
  },

  fieldLabel: { alignSelf: "flex-start", color: "#777", fontSize: 13, marginBottom: 6 },
  deviceNameInput: { width: "100%", borderWidth: 1, borderColor: "#d1d5db", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 18, fontWeight: "700", textAlign: "center", color: "#111827" },
  renameButton: { paddingVertical: 8, paddingHorizontal: 12, marginBottom: 12 },
  renameButtonText: { color: "#4f46e5", fontWeight: "700" },

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
