module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    permissions: [
      ...new Set([
        ...(config.android?.permissions || []),
        "android.permission.VIBRATE",
      ]),
    ],
  },
  plugins: [
    ...(config.plugins || []),
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
