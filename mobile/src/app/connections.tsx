import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";

import {
  Connection,
  getMyConnections,
} from "../services/connectionService";
import { getDeviceProfile } from "../services/deviceStorage";

export default function ConnectionsScreen() {
  const [connections, setConnections] = useState<Connection[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadConnections = useCallback(async () => {
    const profile = await getDeviceProfile();
    const data = await getMyConnections(profile.deviceId);
    setConnections(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function load() {
        try {
          setLoading(true);
          await loadConnections();
        } catch (error) {
          if (active) {
            Alert.alert(
              "Error",
              error instanceof Error
                ? error.message
                : "Unable to load connections."
            );
          }
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      }

      load();

      return () => {
        active = false;
      };
    }, [loadConnections])
  );

  async function refreshConnections() {
    try {
      setRefreshing(true);
      await loadConnections();
    } finally {
      setRefreshing(false);
    }
  }

  function renderConnection({ item }: { item: Connection }) {
    const name =
      item.peerDeviceName ||
      (item.requesterName === item.peerDeviceName
        ? item.receiverName
        : item.requesterName) ||
      item.peerDeviceId ||
      "Unknown device";

    return (
      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>📱</Text>
        </View>

        <View style={styles.content}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.status}>Connected</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Connections</Text>
      <Text style={styles.subtitle}>
        Devices you have paired with
      </Text>

      {loading ? (
        <ActivityIndicator size="large" style={styles.loader} />
      ) : connections.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No connections yet</Text>
          <Text style={styles.emptyText}>
            Enter another device's 8-digit connection code to
            send a pairing request.
          </Text>
        </View>
      ) : (
        <FlatList
          data={connections}
          keyExtractor={(item) => item._id}
          renderItem={renderConnection}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refreshConnections}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
    padding: 20,
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    marginTop: 20,
  },
  subtitle: {
    color: "#777",
    marginTop: 5,
    marginBottom: 25,
  },
  loader: {
    marginTop: 50,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 18,
    marginBottom: 15,
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 23,
  },
  content: {
    flex: 1,
    marginLeft: 14,
  },
  name: {
    fontSize: 18,
    fontWeight: "700",
  },
  status: {
    color: "#16A34A",
    marginTop: 4,
    fontWeight: "600",
  },
  empty: {
    alignItems: "center",
    marginTop: 80,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  emptyText: {
    color: "#777",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 22,
  },
});
