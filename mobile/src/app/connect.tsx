import { useRef, useState } from "react";

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
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
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
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const handledScan = useRef(false);

  async function openScanner() {
    if (!cameraPermission) {
      Alert.alert("Camera unavailable", "Camera permission is still loading. Try again in a moment.");
      return;
    }

    const permission = cameraPermission.granted
      ? cameraPermission
      : await requestCameraPermission();

    if (!permission.granted) {
      Alert.alert("Camera permission needed", "Allow camera access to scan a pairing QR code.");
      return;
    }

    handledScan.current = false;
    setScannerOpen(true);
  }

  function handleQrScanned(result: BarcodeScanningResult) {
    if (handledScan.current) return;

    const scannedCode = result.data.trim().replace(/\s/g, "");
    handledScan.current = true;
    setScannerOpen(false);

    if (!/^\d{8}$/.test(scannedCode)) {
      Alert.alert("QR code not recognized", "Scan a Within Limits pairing code.");
      return;
    }

    setCode(scannedCode);
  }

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

        {scannerOpen ? (
          <View style={styles.scannerPanel}>
            <CameraView
              style={styles.cameraPreview}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={handleQrScanned}
            />
            <Text style={styles.scannerHint}>Point the camera at the host device’s pairing QR code.</Text>
            <TouchableOpacity onPress={() => setScannerOpen(false)}>
              <Text style={styles.cancel}>Close scanner</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.scanButton} onPress={openScanner} disabled={loading}>
            <Text style={styles.scanButtonText}>Scan a QR code</Text>
          </TouchableOpacity>
        )}

        {!scannerOpen && (
          <>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={(value) => {
                const numbers = value.replace(/\D/g, "").slice(0, 8);
                setCode(numbers);
              }}
              placeholder="0000 0000"
              placeholderTextColor="#a6ada7"
              keyboardType="number-pad"
              maxLength={8}
            />

            <TouchableOpacity
              style={[styles.button, loading && styles.disabled]}
              onPress={connectDevice}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? "Sending..." : "Send Connection Request"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.back()} disabled={loading}>
              <Text style={styles.cancel}>Cancel</Text>
            </TouchableOpacity>
          </>
        )}
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
  scanButton: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#cbd5cb",
    backgroundColor: "#fff",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  scanButtonText: { color: "#315743", fontSize: 15, fontWeight: "700" },
  scannerPanel: { marginBottom: 16, alignItems: "center" },
  cameraPreview: { width: "100%", height: 230, borderRadius: 14, overflow: "hidden" },
  scannerHint: { color: "#687774", fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 10 },

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
