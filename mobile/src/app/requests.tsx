import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import BackButton from "../components/back-button";

import {
  acceptConnection,
  Connection,
  getPendingRequests,
  rejectConnection,
} from "../services/connectionService";
import { getDeviceProfile } from "../services/deviceStorage";

export default function RequestsScreen() {
  const [requests, setRequests] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(
    null
  );

  const loadRequests = useCallback(async () => {
    const profile = await getDeviceProfile();
    const data = await getPendingRequests(profile.deviceId);
    setRequests(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function load() {
        try {
          setLoading(true);
          await loadRequests();
        } catch (error) {
          console.error("Load requests error:", error);

          if (active) {
            Alert.alert(
              "Error",
              "Unable to load connection requests."
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
    }, [loadRequests])
  );

  async function refreshRequests() {
    try {
      setRefreshing(true);
      await loadRequests();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleAccept(connectionId: string) {
    try {
      setProcessingId(connectionId);
      const profile = await getDeviceProfile();
      await acceptConnection(connectionId, profile.deviceId);
      setRequests((current) =>
        current.filter((request) => request._id !== connectionId)
      );
      Alert.alert("Connected", "The devices are now paired.");
    } catch (error) {
      Alert.alert(
        "Error",
        error instanceof Error
          ? error.message
          : "Unable to accept request."
      );
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(connectionId: string) {
    try {
      setProcessingId(connectionId);
      const profile = await getDeviceProfile();
      await rejectConnection(connectionId, profile.deviceId);
      setRequests((current) =>
        current.filter((request) => request._id !== connectionId)
      );
    } catch (error) {
      Alert.alert(
        "Error",
        error instanceof Error
          ? error.message
          : "Unable to reject request."
      );
    } finally {
      setProcessingId(null);
    }
  }

  function renderRequest({ item }: { item: Connection }) {
    const processing = processingId === item._id;
    const requesterName = item.requesterName || item.requesterId;

    return (
      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>📱</Text>
        </View>

        <View style={styles.content}>
          <Text style={styles.heading}>New Connection Request</Text>
          <Text style={styles.deviceName}>{requesterName}</Text>
          <Text style={styles.message}>wants to connect</Text>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.rejectButton}
              disabled={processing}
              onPress={() => handleReject(item._id)}
            >
              <Text style={styles.rejectText}>Reject</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.acceptButton}
              disabled={processing}
              onPress={() => handleAccept(item._id)}
            >
              {processing ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.acceptText}>Accept</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BackButton />
      <Text style={styles.title}>Connection Requests</Text>
      <Text style={styles.subtitle}>
        Incoming pairing requests for this device
      </Text>

      {loading ? (
        <ActivityIndicator size="large" style={styles.loader} />
      ) : requests.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No requests</Text>
          <Text style={styles.emptyText}>
            You don&apos;t have any pending connection requests.
          </Text>
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item._id}
          renderItem={renderRequest}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refreshRequests}
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
    marginTop: 0,
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
  heading: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 4,
  },
  deviceName: {
    fontSize: 18,
    fontWeight: "700",
  },
  message: {
    color: "#777",
    marginTop: 4,
  },
  actions: {
    flexDirection: "row",
    marginTop: 15,
    gap: 10,
  },
  rejectButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },
  rejectText: {
    color: "#374151",
    fontWeight: "600",
  },
  acceptButton: {
    flex: 1,
    backgroundColor: "#111827",
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },
  acceptText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  empty: {
    alignItems: "center",
    marginTop: 100,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginTop: 15,
  },
  emptyText: {
    color: "#777",
    textAlign: "center",
    marginTop: 8,
  },
});
