import { useEffect, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
  ScrollView,
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
  const [needsRegistration, setNeedsRegistration] = useState(false);
  const [startupVersion, setStartupVersion] = useState(0);

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

        if (!deviceProfile.connectionCode) {
          if (mounted) {
            setDeviceName(deviceProfile.deviceName || "");
            setNeedsRegistration(true);
            setStatus("Register this device to get a pairing code.");
            setLoading(false);
          }
          return;
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

        const handleDeviceBuzzer = (data: { fromDeviceName?: string; fromDeviceId?: string }) => {
          Vibration.vibrate([0, 350, 220, 350, 220, 450]);
          Alert.alert(
            "Someone is looking for you",
            `${data.fromDeviceName || data.fromDeviceId || "A connected device"} sent a buzzer.`
          );
        };
        socket.on("device-buzzer", handleDeviceBuzzer);

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
  }, [router, startupVersion]);

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

  async function registerThisDevice() {
    const normalizedName = deviceName.trim();
    if (!normalizedName) {
      Alert.alert("Choose a device name", "Give this device a name before registering it.");
      return;
    }
    setSavingName(true);
    try {
      const profile = await getDeviceProfile();
      const registered = await registerDevice({ ...profile, deviceName: normalizedName });
      await saveDeviceProfile({
        ...profile,
        deviceName: registered.deviceName || normalizedName,
        connectionCode: registered.connectionCode,
      });
      setNeedsRegistration(false);
      setLoading(true);
      setStartupVersion((version) => version + 1);
    } catch (error) {
      Alert.alert("Registration failed", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSavingName(false);
    }
  }

  if (loading && !connectionCode && !needsRegistration) {
    return (
      <View style={styles.loadingScreen}>
        <Text style={styles.brand}>WITHIN LIMITS</Text>
        <ActivityIndicator color="#477a64" style={{ marginTop: 20 }} />
        <Text style={styles.loadingText}>Checking this device…</Text>
      </View>
    );
  }

  // ==========================================
  // UI
  // ==========================================

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.page}>
      <View style={styles.header}>
        <Text style={styles.brand}>WITHIN LIMITS</Text>
        {!needsRegistration && (
          <View style={styles.serverBadge}>
            <View style={[styles.statusDot, socketStatus === "Connected" ? styles.connectedDot : styles.disconnectedDot]} />
            <Text style={styles.serverBadgeText}>{socketStatus}</Text>
          </View>
        )}
      </View>

      {needsRegistration ? (
        <View style={styles.registerCard}>
          <Text style={styles.eyebrow}>FIRST TIME SETUP</Text>
          <Text style={styles.headline}>Name this device</Text>
          <Text style={styles.description}>This name helps people recognise your phone when they ask to connect.</Text>
          <Text style={styles.fieldLabel}>DEVICE NAME</Text>
          <TextInput
            accessibilityLabel="Device name"
            value={deviceName}
            onChangeText={setDeviceName}
            placeholder="e.g. Maya’s phone"
            placeholderTextColor="#969b9b"
            maxLength={32}
            style={styles.deviceNameInput}
            returnKeyType="done"
            onSubmitEditing={registerThisDevice}
          />
          <TouchableOpacity style={styles.primaryButton} onPress={registerThisDevice} disabled={savingName} activeOpacity={0.8}>
            {savingName ? <ActivityIndicator color="#102321" /> : <Text style={styles.primaryButtonText}>Register device</Text>}
          </TouchableOpacity>
          <Text style={styles.footnote}>Registration is for this device installation. It doesn’t create a personal account.</Text>
        </View>
      ) : (
        <>
          <Text style={styles.eyebrow}>YOUR DEVICES</Text>
          <Text style={styles.headline}>Location sharing</Text>
          <Text style={styles.description}>Choose who can see this device, and see the devices connected to you.</Text>

          <View style={styles.deviceCard}>
            <View style={styles.deviceCardTop}>
              <View>
                <Text style={styles.cardEyebrow}>THIS DEVICE</Text>
                <Text style={styles.deviceName}>{deviceName || "My device"}</Text>
              </View>
              <View style={styles.onlinePill}><View style={styles.onlineDot} /><Text style={styles.onlineText}>{status === "Ready" ? "Ready" : status}</Text></View>
            </View>
            <Text style={styles.codeLabel}>HOST CODE</Text>
            <Text style={styles.code}>{formatConnectionCode(connectionCode)}</Text>
            <Text style={styles.codeHint}>A device using this code will request to join. Approve requests from people you trust. You can connect up to four devices.</Text>
            {loading && <ActivityIndicator color="#477a64" style={styles.loader} />}
            <View style={styles.nameEditor}>
              <TextInput accessibilityLabel="Device name" value={deviceName} onChangeText={setDeviceName} placeholder="Name this device" maxLength={32} style={styles.inlineNameInput} returnKeyType="done" onSubmitEditing={saveDeviceName} />
              <TouchableOpacity style={styles.saveNameButton} onPress={saveDeviceName} disabled={savingName || loading}>
                <Text style={styles.saveNameText}>{savingName ? "Saving…" : "Save name"}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.sectionTitle}>LOCATION</Text>
          <TouchableOpacity style={styles.mapButton} onPress={openSharedMap} activeOpacity={0.8}>
            <View style={styles.mapButtonCopy}><Text style={styles.mapButtonTitle}>Shared map</Text><Text style={styles.mapButtonSubtitle}>View the latest locations from connected devices</Text></View>
          </TouchableOpacity>
          <Text style={styles.sectionTitle}>DEVICES</Text>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionCard} onPress={openConnect} activeOpacity={0.8}><Text style={styles.actionTitle}>Join a host</Text><Text style={styles.actionSubtitle}>Enter their 8 digit code</Text></TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={openConnections} activeOpacity={0.8}><Text style={styles.actionTitle}>Connected devices</Text><Text style={styles.actionSubtitle}>Distance, status and controls</Text></TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.requestsButton} onPress={openRequests} activeOpacity={0.8}><Text style={styles.requestsText}>Review connection requests</Text></TouchableOpacity>
          <TouchableOpacity onPress={openNearby} activeOpacity={0.8}><Text style={styles.nearbyLink}>Nearby devices (optional)</Text></TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  loadingScreen: { flex: 1, backgroundColor: "#f4f5ef", justifyContent: "center", alignItems: "center" },
  loadingText: { color: "#687774", marginTop: 12, fontSize: 13 },
  container: { flex: 1, backgroundColor: "#f4f5ef" },
  page: { padding: 22, paddingTop: 18, paddingBottom: 40, width: "100%", maxWidth: 560, alignSelf: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 36 },
  brand: { color: "#193532", fontSize: 13, letterSpacing: 2.2, fontWeight: "900" },
  serverBadge: { flexDirection: "row", alignItems: "center", paddingVertical: 7, paddingHorizontal: 10, borderRadius: 20, backgroundColor: "#e6e9df" },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 7 },
  connectedDot: { backgroundColor: "#4d9a6a" },
  disconnectedDot: { backgroundColor: "#d67e64" },
  serverBadgeText: { color: "#465753", fontSize: 11, fontWeight: "700" },
  eyebrow: { color: "#6e827c", fontSize: 11, letterSpacing: 1.7, fontWeight: "800", marginBottom: 10 },
  headline: { color: "#17312e", fontSize: 34, lineHeight: 39, fontWeight: "800", letterSpacing: -0.8, marginBottom: 8 },
  description: { color: "#687774", fontSize: 15, lineHeight: 22, marginBottom: 22 },
  deviceCard: { backgroundColor: "#fff", borderRadius: 12, padding: 18, marginBottom: 28, borderWidth: 1, borderColor: "#e2e5de" },
  deviceCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 25 },
  cardEyebrow: { color: "#78847d", fontSize: 10, letterSpacing: 1.2, fontWeight: "700", marginBottom: 5 },
  deviceName: { color: "#243630", fontSize: 20, fontWeight: "700" },
  onlinePill: { flexDirection: "row", alignItems: "center", backgroundColor: "#edf3ed", borderRadius: 7, paddingVertical: 6, paddingHorizontal: 9 },
  onlineDot: { height: 6, width: 6, borderRadius: 3, backgroundColor: "#4d9a6a", marginRight: 6 },
  onlineText: { color: "#385b47", fontSize: 10, fontWeight: "700", maxWidth: 90 },
  codeLabel: { color: "#78847d", fontSize: 10, letterSpacing: 1.2, fontWeight: "700", marginBottom: 4 },
  code: { color: "#233b31", fontSize: 32, letterSpacing: 3, fontWeight: "700", marginBottom: 7 },
  codeHint: { color: "#69766f", fontSize: 12, lineHeight: 18, marginBottom: 17 },
  nameEditor: { flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: 1, borderTopColor: "#e7e9e4", paddingTop: 12 },
  inlineNameInput: { flex: 1, color: "#243630", fontSize: 13, paddingVertical: 7 },
  saveNameButton: { backgroundColor: "#e8eee7", borderRadius: 8, paddingVertical: 9, paddingHorizontal: 11 },
  saveNameText: { color: "#315743", fontSize: 11, fontWeight: "700" },
  loader: { marginBottom: 10 },
  sectionTitle: { color: "#82908b", letterSpacing: 1.3, fontSize: 10, fontWeight: "800", marginBottom: 10 },
  mapButton: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e5de", borderRadius: 12, padding: 16, marginBottom: 18 },
  mapButtonCopy: { flex: 1 },
  mapButtonTitle: { color: "#243630", fontSize: 15, fontWeight: "700", marginBottom: 4 },
  mapButtonSubtitle: { color: "#68766f", fontSize: 12 },
  arrow: { color: "#31554a", fontSize: 21, fontWeight: "600" },
  actionRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  actionCard: { flex: 1, minHeight: 122, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e6e9df", borderRadius: 16, padding: 15 },
  actionTitle: { color: "#233d37", fontSize: 14, fontWeight: "700", marginBottom: 7 },
  actionSubtitle: { color: "#7b8984", fontSize: 11, lineHeight: 16 },
  requestsButton: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#fff", borderColor: "#e6e9df", borderWidth: 1, borderRadius: 14, padding: 15 },
  requestsText: { color: "#34554a", fontSize: 13, fontWeight: "700" },
  nearbyLink: { alignSelf: "center", marginTop: 18, color: "#78857e", fontSize: 12 },
  registerCard: { backgroundColor: "#fff", borderRadius: 22, padding: 22, borderWidth: 1, borderColor: "#e6e9df" },
  iconCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#e3ffa8", alignItems: "center", justifyContent: "center", marginBottom: 22 },
  iconText: { color: "#193532", fontSize: 12, fontWeight: "900" },
  fieldLabel: { color: "#72817b", fontSize: 10, letterSpacing: 1.2, fontWeight: "800", marginBottom: 8 },
  deviceNameInput: { width: "100%", borderWidth: 1, borderColor: "#d9dfd5", backgroundColor: "#fbfcf8", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: "#203a35", marginBottom: 10 },
  primaryButton: { minHeight: 52, backgroundColor: "#dfff9b", borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 8 },
  primaryButtonText: { color: "#193532", fontSize: 15, fontWeight: "800" },
  footnote: { marginTop: 16, color: "#89958f", fontSize: 11, lineHeight: 16, textAlign: "center" },
});
