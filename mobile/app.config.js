const { expo } = require("./app.json");

module.exports = {
  ...expo,
  plugins: [
    ...(expo.plugins || []),
    ["expo-location", {
      locationWhenInUsePermission:
        "Allow Within Limits to show your location on the shared map and share it with connected devices.",
    }],
  ],
};
