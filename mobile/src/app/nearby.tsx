import { useEffect, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import * as Location from "expo-location";
import { useRouter } from "expo-router";

import {
  Device,
  getNearbyDevices,
} from "../services/connectionService";

import { getDeviceProfile } from "../services/deviceStorage";

export default function NearbyScreen() {
  const router = useRouter();
  const [devices, setDevices] =
    useState<Device[]>([]);

  const [loading, setLoading] =
    useState(true);


  useEffect(() => {
    loadNearbyDevices();
  }, []);

  async function loadNearbyDevices() {
    try {
      setLoading(true);

      // ------------------------------------
      // LOCATION PERMISSION
      // ------------------------------------

      const {
        status,
      } =
        await Location.requestForegroundPermissionsAsync();

      if (
        status !==
        Location.PermissionStatus.GRANTED
      ) {
        Alert.alert(
          "Location Required",
          "Location permission is required to find nearby devices."
        );

        return;
      }

      // ------------------------------------
      // GET CURRENT LOCATION
      // ------------------------------------

      const location =
        await Location.getCurrentPositionAsync(
          {
            accuracy:
              Location.Accuracy.High,
          }
        );

      const {
        latitude,
        longitude,
      } = location.coords;

      console.log(
        "Searching nearby devices:"
      );

      console.log(
        "Latitude:",
        latitude
      );

      console.log(
        "Longitude:",
        longitude
      );

      // ------------------------------------
      // SEARCH WITHIN 5 KM
      // ------------------------------------

      const profile = await getDeviceProfile();
      const nearby =
        await getNearbyDevices(
          latitude,
          longitude,
          5000,
          profile.deviceId
        );

      // Don't show our own device
      const otherDevices =
        nearby.filter(
          (device) => device.deviceId !== profile.deviceId
        );

      setDevices(
        otherDevices
      );
    } catch (error) {
      console.error(
        "Nearby devices error:",
        error
      );

      Alert.alert(
        "Error",
        error instanceof Error
          ? error.message
          : "Unable to load nearby devices."
      );
    } finally {
      setLoading(false);
    }
  }

  // ========================================
  // DEVICE CARD
  // ========================================

  function renderDevice({
    item,
  }: {
    item: Device;
  }) {
    return (
      <View style={styles.card}>
        {/* DEVICE INFORMATION */}

        <View style={styles.deviceInfo}>
          <View style={styles.icon}>
            <Text style={styles.iconText}>
              📱
            </Text>
          </View>

          <View style={styles.deviceDetails}>
            <Text style={styles.deviceName}>
              {item.deviceName ||
                "Unknown Device"}
            </Text>

            <Text style={styles.deviceId}>
              {item.deviceId}
            </Text>

            <Text style={styles.online}>
              ● Online
            </Text>
          </View>
        </View>

        {/* OPEN SHARED MAP */}

        <TouchableOpacity
          style={[
            styles.connectButton,
          ]}
          onPress={() => router.push("/locations")}
        >
          <Text style={styles.buttonText}>VIEW MAP</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* HEADER */}

      <Text style={styles.title}>
        Nearby Connections
      </Text>

      <Text style={styles.subtitle}>
        Connected devices within 5 km
      </Text>

      {/* LOADING */}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator
            size="large"
          />

          <Text style={styles.loadingText}>
            Searching for devices...
          </Text>
        </View>
      ) : devices.length === 0 ? (
        /* EMPTY */

        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>
            📡
          </Text>

          <Text style={styles.emptyTitle}>
            No connected devices nearby
          </Text>

          <Text style={styles.emptyText}>
            No connected device with a recent location was found within 5 km.
          </Text>

          <TouchableOpacity
            style={styles.refreshButton}
            onPress={
              loadNearbyDevices
            }
          >
            <Text
              style={
                styles.refreshText
              }
            >
              Search Again
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        /* DEVICE LIST */

        <FlatList
          data={devices}
          keyExtractor={(item) =>
            item.deviceId
          }
          renderItem={
            renderDevice
          }
          contentContainerStyle={
            styles.list
          }
          showsVerticalScrollIndicator={
            false
          }
          refreshing={loading}
          onRefresh={
            loadNearbyDevices
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
    marginTop: 50,
  },

  subtitle: {
    fontSize: 15,
    color: "#777",
    marginTop: 5,
    marginBottom: 25,
  },

  loading: {
    alignItems: "center",
    marginTop: 80,
  },

  loadingText: {
    marginTop: 15,
    color: "#777",
  },

  list: {
    paddingBottom: 30,
  },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 18,
    marginBottom: 15,

    elevation: 3,

    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,

    shadowOffset: {
      width: 0,
      height: 3,
    },
  },

  deviceInfo: {
    flexDirection: "row",
    alignItems: "center",
  },

  icon: {
    width: 55,
    height: 55,
    borderRadius: 28,

    backgroundColor: "#EEF2FF",

    alignItems: "center",
    justifyContent: "center",

    marginRight: 15,
  },

  iconText: {
    fontSize: 26,
  },

  deviceDetails: {
    flex: 1,
  },

  deviceName: {
    fontSize: 17,
    fontWeight: "700",
  },

  deviceId: {
    fontSize: 13,
    color: "#777",
    marginTop: 3,
  },

  online: {
    fontSize: 12,
    color: "#16A34A",
    marginTop: 5,
  },

  connectButton: {
    backgroundColor: "#111827",

    borderRadius: 12,

    paddingVertical: 13,

    alignItems: "center",

    marginTop: 18,
  },

  disabledButton: {
    opacity: 0.6,
  },

  buttonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },

  empty: {
    alignItems: "center",
    marginTop: 90,
    paddingHorizontal: 20,
  },

  emptyIcon: {
    fontSize: 50,
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
    lineHeight: 20,
  },

  refreshButton: {
    backgroundColor: "#111827",
    paddingHorizontal: 25,
    paddingVertical: 13,
    borderRadius: 12,
    marginTop: 20,
  },

  refreshText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
