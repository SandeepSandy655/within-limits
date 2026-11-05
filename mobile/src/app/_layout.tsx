import { Stack } from "expo-router";
import { useEffect, useState, useSyncExternalStore } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../providers/AuthProvider';
import { colors } from '../components/ui';
import { getServerAddress, initializeServerAddress, subscribeServerAddress } from '../services/serverConfig';

export default function RootLayout() {
  const address = useSyncExternalStore(subscribeServerAddress, getServerAddress, getServerAddress);
  const [ready, setReady] = useState(false);
  useEffect(() => { void initializeServerAddress().then(() => setReady(true)); }, []);
  return <GestureHandlerRootView style={{ flex: 1 }}><SafeAreaProvider><KeyboardProvider>{ready ? <AuthProvider key={address}><Session /></AuthProvider> : <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={colors.green} /></View>}</KeyboardProvider></SafeAreaProvider></GestureHandlerRootView>;
}
function Session() {
  return <><StatusBar style="dark" /><Routes /></>;
}

function Routes() {
  const { loading, canAccessApp } = useAuth();
  if (loading) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={colors.green} /></View>;
  return <><Stack screenOptions={{ headerShown: false }}>
    <Stack.Screen name="sign-in" />
    <Stack.Screen name="server-settings" />
    <Stack.Protected guard={canAccessApp}>
      <Stack.Screen name="(main)" />
    </Stack.Protected>
  </Stack></>;
}
