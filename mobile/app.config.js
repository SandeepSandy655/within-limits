const { backendBuildSettings } = require('./config/build-backend.cjs');
const googleServices = require('./src/google-services.json');

module.exports = ({ config }) => {
  const backend = backendBuildSettings();
  return ({
  ...config,
  name: backend.local ? "Within Limits Wi-Fi" : "Within Limits",
  scheme: "withinlimits",
  extra: {
    ...config.extra,
    firebaseProjectId: googleServices.project_info.project_id,
  },
  // The authenticated web app does not need a Node renderer during local development.
  // Expo sets NODE_ENV=production for exports, where static output remains available.
  web: {
    ...config.web,
    output: process.env.NODE_ENV === "production" ? (config.web?.output || "static") : "single",
  },
  experiments: {
    ...config.experiments,
    reactCompiler: process.env.NODE_ENV === "production" && config.experiments?.reactCompiler === true,
  },
  ios: {
    ...config.ios,
    ...(process.env.IOS_BUNDLE_IDENTIFIER ? { bundleIdentifier: process.env.IOS_BUNDLE_IDENTIFIER } : {}),
  },
  android: {
    ...config.android,
    softwareKeyboardLayoutMode: "resize",
    ...(process.env.ANDROID_PACKAGE ? { package: process.env.ANDROID_PACKAGE } : {}),
    permissions: [
      ...new Set([
        ...(config.android?.permissions || []),
        "android.permission.VIBRATE",
      ]),
    ],
  },
  plugins: [
    ...(config.plugins || []),
    "expo-secure-store",
    "expo-image",
    "expo-web-browser",
    ["expo-build-properties", { android: { usesCleartextTraffic: backend.cleartext } }],
    ...(process.env.GOOGLE_IOS_URL_SCHEME ? [["@react-native-google-signin/google-signin", { iosUrlScheme: process.env.GOOGLE_IOS_URL_SCHEME }]] : ["@react-native-google-signin/google-signin"]),
    ["expo-camera", {
      cameraPermission:
        "Allow Within Limits to scan device pairing QR codes.",
      microphonePermission: false,
      recordAudioAndroid: false,
    }],
    ["expo-location", {
      locationWhenInUsePermission:
        "Allow Within Limits to show your location on the shared map and share it with connected devices.",
    }],
  ],
  });
};
