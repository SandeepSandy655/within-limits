import { useState } from "react";

import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useRouter } from "expo-router";

import { getDeviceProfile } from "../services/deviceStorage";

import {
  sendConnectionRequestByCode,
} from "../services/connectionService";

export default function ConnectScreen() {
  const router = useRouter();

  const [code, setCode] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  async function connectDevice() {
    const cleanCode =
      code.replace(/\D/g, "");

    if (cleanCode.length !== 8) {
      Alert.alert(
        "Invalid Code",
        "Enter the 8-digit connection code."
      );

      return;
    }

    try {
      setLoading(true);

      const device =
        await getDeviceProfile();

      await sendConnectionRequestByCode(
        device.deviceId,
        cleanCode
      );

      Alert.alert(
        "Request Sent",
        "The connection request has been sent.",
        [
          {
            text: "OK",
            onPress: () => {
              router.back();
            },
          },
        ]
      );
    } catch (error) {
      Alert.alert(
        "Connection Failed",
        error instanceof Error
          ? error.message
          : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={
        Platform.OS === "ios"
          ? "padding"
          : undefined
      }
    >
      <View style={styles.content}>
        <Text style={styles.title}>
          Connect Device
        </Text>

        <Text style={styles.subtitle}>
          Enter the 8-digit connection code
          of the device you want to pair with.
        </Text>

        <TextInput
          style={styles.input}
          value={code}
          onChangeText={(value) => {
            const numbers =
              value
                .replace(/\D/g, "")
                .slice(0, 8);

            setCode(numbers);
          }}
          placeholder="48217356"
          placeholderTextColor="#999"
          keyboardType="number-pad"
          maxLength={8}
          autoFocus
        />

        <TouchableOpacity
          style={[
            styles.button,
            loading &&
              styles.disabled,
          ]}
          onPress={connectDevice}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading
              ? "Sending..."
              : "Send Connection Request"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() =>
            router.back()
          }
          disabled={loading}
        >
          <Text style={styles.cancel}>
            Cancel
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f7fa",
  },

  content: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
  },

  title: {
    fontSize: 30,
    fontWeight: "700",
    marginBottom: 10,
  },

  subtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 30,
    lineHeight: 23,
  },

  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 20,
    height: 65,
    fontSize: 26,
    letterSpacing: 5,
    textAlign: "center",
    marginBottom: 20,
  },

  button: {
    backgroundColor: "#111827",
    height: 55,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  disabled: {
    opacity: 0.5,
  },

  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },

  cancel: {
    textAlign: "center",
    marginTop: 20,
    color: "#666",
    fontSize: 15,
  },
});