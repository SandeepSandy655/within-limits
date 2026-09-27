import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: "Home",
        }}
      />

      <Stack.Screen
        name="connect"
        options={{
          title: "Connect Device",
        }}
      />

      <Stack.Screen
        name="connections"
        options={{
          title: "My Connections",
        }}
      />

      <Stack.Screen
        name="requests"
        options={{
          title: "Connection Requests",
        }}
      />

      <Stack.Screen
        name="nearby"
        options={{
          title: "Nearby Devices",
        }}
      />
    </Stack>
  );
}
