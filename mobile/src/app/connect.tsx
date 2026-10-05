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
import BackButton from "../components/back-button";

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
      <BackButton style={styles.backButton} />
      <View style={styles.content}>
        <Text style={styles.title}>
          Add a device
        </Text>

        <Text style={styles.subtitle}>
          Enter the pairing code from the device you want to add. They’ll need to accept your request before locations are shared.
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
          placeholder="0000 0000"
          placeholderTextColor="#a6ada7"
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
    backgroundColor: "#f4f5ef",
  },

  content: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
  },
  backButton: {
    position: "absolute",
    top: 8,
    left: 16,
    zIndex: 1,
  },

  title: {
    fontSize: 34,
    color: "#17312e",
    fontWeight: "800",
    letterSpacing: -0.6,
    marginBottom: 10,
  },

  subtitle: {
    fontSize: 16,
    color: "#687774",
    marginBottom: 30,
    lineHeight: 23,
  },

  input: {
    borderWidth: 1,
    borderColor: "#d9dfd5",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 20,
    height: 65,
    fontSize: 27,
    letterSpacing: 4,
    textAlign: "center",
    marginBottom: 20,
    color: "#193532",
  },

  button: {
    backgroundColor: "#dfff9b",
    height: 55,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  disabled: {
    opacity: 0.5,
  },

  buttonText: {
    color: "#193532",
    fontSize: 16,
    fontWeight: "600",
  },

  cancel: {
    textAlign: "center",
    marginTop: 20,
    color: "#687774",
    fontSize: 15,
  },
});
