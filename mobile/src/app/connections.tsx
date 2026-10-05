import { useCallback, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import BackButton from "../components/back-button";

import { getDeviceProfile } from "../services/deviceStorage";

import {
  getMyConnections,
  getConnectedDevices,
  disconnectDevice,
  ringDevice,
  Connection,
} from "../services/connectionService";

const MAX_LINKED_DEVICES = 4;

function distanceBetweenMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(meters: number) {
  if (meters < 1000) return `About ${Math.max(1, Math.round(meters))} m away`;
  return `About ${(meters / 1000).toFixed(1)} km away`;
}

export default function ConnectionsScreen() {
  const [connections, setConnections] =
    useState<Connection[]>([]);

  const [loading, setLoading] =
    useState(true);
  const [deviceId, setDeviceId] = useState("");
  const [deviceNames, setDeviceNames] = useState<Record<string, { name: string; status: string; location?: { coordinates?: [number, number] } }>>({});
  const [ringingId, setRingingId] = useState<string | null>(null);
  const [myLocation, setMyLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  async function loadConnections(showLoading = true) {
    try {
      if (showLoading) setLoading(true);

      const device =
        await getDeviceProfile();

      const result =
        await getMyConnections(
          device.deviceId
        );
      const peers = await getConnectedDevices(device.deviceId);
      let currentLocation: { latitude: number; longitude: number } | null = null;
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.granted) {
        try {
          const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          currentLocation = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        } catch {
          // Keep the connection list usable when location services are off or unavailable.
        }
      }
      setMyLocation(currentLocation);
      setDeviceId(device.deviceId);
      setDeviceNames(Object.fromEntries(peers.map((peer) => [peer.deviceId, { name: peer.deviceName, status: peer.status, location: peer.location }])));
      setConnections(result);
    } catch (error) {
      if (showLoading) {
        Alert.alert(
          "Error",
          error instanceof Error
            ? error.message
            : "Failed to load connections"
        );
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  function confirmDisconnect(connection: Connection) {
    const peerId = connection.requesterId === deviceId ? connection.receiverId : connection.requesterId;
    const peerName = deviceNames[peerId]?.name || peerId;
    Alert.alert("Disconnect device?", `${peerName} will no longer receive your location, and you will no longer see theirs.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Disconnect", style: "destructive", onPress: async () => {
        try {
          await disconnectDevice(connection._id, deviceId);
          setConnections((current) => current.filter((item) => item._id !== connection._id));
        } catch (error) {
          Alert.alert("Could not disconnect", error instanceof Error ? error.message : "Please try again.");
        }
      } },
    ]);
  }

  async function ringConnectedDevice(connection: Connection) {
    const peerId = connection.requesterId === deviceId ? connection.receiverId : connection.requesterId;
    setRingingId(peerId);
    try {
      await ringDevice(deviceId, peerId);
      Alert.alert("Buzzer sent", `${deviceNames[peerId]?.name || "The device"} should vibrate if its app is online.`);
    } catch (error) {
      Alert.alert("Could not reach device", error instanceof Error ? error.message : "Make sure the device is online.");
    } finally {
      setRingingId(null);
    }
  }

  useFocusEffect(
    useCallback(() => {
      void loadConnections();
      const refreshInterval = setInterval(() => {
        void loadConnections(false);
      }, 15_000);
      return () => clearInterval(refreshInterval);
    }, [])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BackButton />
      <Text style={styles.title}>Devices</Text>
      <Text style={styles.subtitle}>See how far away each device is, send a buzz or remove a connection.</Text>
      {(() => {
        const hostLinks = connections.filter((item) => item.receiverId === deviceId).length;
        const linkedTo = connections.find((item) => item.requesterId === deviceId);
        return (
          <View style={styles.roleCard}>
            <Text style={styles.roleTitle}>{linkedTo ? "LINKED DEVICE" : "HOST DEVICE"}</Text>
            <Text style={styles.roleText}>{linkedTo
              ? `Linked to ${deviceNames[linkedTo.receiverId]?.name || linkedTo.receiverName || "your host"}. This device can’t host or join another circle.`
              : `${hostLinks} of ${MAX_LINKED_DEVICES} linked devices`}</Text>
          </View>
        );
      })()}

      {connections.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            No connections yet
          </Text>

          <Text style={styles.emptyText}>
            Connect to another device using
            its connection code.
          </Text>
        </View>
      ) : (
        <FlatList
          data={connections}
          keyExtractor={(item) =>
            item._id
          }
          contentContainerStyle={
            styles.list
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.device}>
                Connected device
              </Text>

              <Text style={styles.deviceId}>
                {deviceNames[item.requesterId === deviceId ? item.receiverId : item.requesterId]?.name ||
                  (item.requesterId === deviceId ? item.receiverId : item.requesterId)}
              </Text>
              <Text style={styles.deviceDetail}>
                {deviceNames[item.requesterId === deviceId ? item.receiverId : item.requesterId]?.status === "online" ? "Online" : "Offline"}
              </Text>
              <Text style={styles.distance}>
                {(() => {
                  const peer = deviceNames[item.requesterId === deviceId ? item.receiverId : item.requesterId];
                  const coordinates = peer?.location?.coordinates;
                  if (!myLocation || !coordinates || coordinates.length < 2) return "Distance unavailable — waiting for location";
                  return formatDistance(distanceBetweenMeters(myLocation.latitude, myLocation.longitude, coordinates[1], coordinates[0]));
                })()}
              </Text>

              <View
                style={styles.statusContainer}
              >
                <View
                  style={styles.statusDot}
                />

                <Text
                  style={styles.status}
                >
                  Connected
                </Text>
              </View>
              <TouchableOpacity style={styles.disconnectButton} onPress={() => confirmDisconnect(item)}>
                <Text style={styles.disconnectText}>Disconnect</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ringButton}
                onPress={() => ringConnectedDevice(item)}
                disabled={ringingId !== null || deviceNames[item.requesterId === deviceId ? item.receiverId : item.requesterId]?.status !== "online"}
              >
                <Text style={styles.ringText}>{ringingId === (item.requesterId === deviceId ? item.receiverId : item.requesterId) ? "Sending…" : "Buzz device"}</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f4f5ef",
    padding: 20,
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  title: {
    fontSize: 32,
    color: "#17312e",
    fontWeight: "800",
    marginTop: 0,
    marginBottom: 5,
  },
  subtitle: { color: "#687774", lineHeight: 20, marginBottom: 22 },

  list: {
    paddingBottom: 20,
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 20,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#e6e9df",
  },

  device: {
    fontSize: 13,
    color: "#777",
    marginBottom: 6,
  },

  deviceId: {
    fontSize: 18,
    color: "#193532",
    fontWeight: "700",
  },

  deviceDetail: { color: "#6b7280", marginTop: 5 },
  distance: { color: "#315b4d", fontSize: 15, fontWeight: "700", marginTop: 12 },
  roleCard: { backgroundColor: "#e8eee7", borderRadius: 12, padding: 14, marginBottom: 16 },
  roleTitle: { color: "#5c7066", fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginBottom: 5 },
  roleText: { color: "#233d37", lineHeight: 20 },
  disconnectButton: { alignSelf: "flex-start", marginTop: 16, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: "#fef2f2" },
  disconnectText: { color: "#b91c1c", fontWeight: "700" },
  ringButton: { alignSelf: "flex-start", marginTop: 9, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8, backgroundColor: "#e3ffa8" },
  ringText: { color: "#193532", fontWeight: "700" },

  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 15,
  },

  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#22c55e",
    marginRight: 8,
  },

  status: {
    color: "#22c55e",
    fontWeight: "600",
  },

  empty: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 25,
    alignItems: "center",
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },

  emptyText: {
    textAlign: "center",
    color: "#777",
    lineHeight: 21,
  },
});
