const { expo } = require("./app.json");

module.exports = {
  ...expo,
  android: {
    ...expo.android,
    permissions: [
      ...new Set([
        ...(expo.android?.permissions || []),
        "android.permission.VIBRATE",
      ]),
    ],
  },
  plugins: [
    ...(expo.plugins || []),
    ["expo-location", {
      locationWhenInUsePermission:
        "Allow Within Limits to show your location on the shared map and share it with connected devices.",
    }],
  ],
};
