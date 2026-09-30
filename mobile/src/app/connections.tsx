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

import { getDeviceProfile } from "../services/deviceStorage";

import {
  getMyConnections,
  getConnectedDevices,
  disconnectDevice,
  Connection,
} from "../services/connectionService";

export default function ConnectionsScreen() {
  const [connections, setConnections] =
    useState<Connection[]>([]);

  const [loading, setLoading] =
    useState(true);
  const [deviceId, setDeviceId] = useState("");
  const [deviceNames, setDeviceNames] = useState<Record<string, { name: string; status: string }>>({});

  async function loadConnections() {
    try {
      setLoading(true);

      const device =
        await getDeviceProfile();

      const result =
        await getMyConnections(
          device.deviceId
        );
      const peers = await getConnectedDevices(device.deviceId);
      setDeviceId(device.deviceId);
      setDeviceNames(Object.fromEntries(peers.map((peer) => [peer.deviceId, { name: peer.deviceName, status: peer.status }])));
      setConnections(result);
    } catch (error) {
      Alert.alert(
        "Error",
        error instanceof Error
          ? error.message
          : "Failed to load connections"
      );
    } finally {
      setLoading(false);
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

  useFocusEffect(
    useCallback(() => {
      loadConnections();
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
      <Text style={styles.title}>
        My Connections
      </Text>

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
    backgroundColor: "#f5f7fa",
    padding: 20,
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  title: {
    fontSize: 30,
    fontWeight: "700",
    marginTop: 20,
    marginBottom: 25,
  },

  list: {
    paddingBottom: 20,
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 15,
  },

  device: {
    fontSize: 13,
    color: "#777",
    marginBottom: 6,
  },

  deviceId: {
    fontSize: 15,
    fontWeight: "600",
  },

  deviceDetail: { color: "#6b7280", marginTop: 5 },
  disconnectButton: { alignSelf: "flex-start", marginTop: 16, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: "#fef2f2" },
  disconnectText: { color: "#b91c1c", fontWeight: "700" },

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
