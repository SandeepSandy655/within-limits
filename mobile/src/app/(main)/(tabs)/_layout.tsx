import { Tabs } from 'expo-router';
import { AppHeader, BottomNavigation } from '@/components/AppNavigation';
import { colors } from '@/components/ui';

export default function TabsLayout() {
  return <Tabs backBehavior="history" tabBar={(props) => <BottomNavigation {...props} />} screenOptions={{ header: () => <AppHeader />, sceneStyle: { backgroundColor: colors.bg }, tabBarHideOnKeyboard: true, animation: 'none' }}>
    <Tabs.Screen name="index" options={{ title: 'Home' }} />
    <Tabs.Screen name="locations" options={{ title: 'Map' }} />
    <Tabs.Screen name="invite" options={{ title: 'Pair' }} />
    <Tabs.Screen name="connections" options={{ title: 'Group' }} />
    <Tabs.Screen name="account" options={{ title: 'Account' }} />
    {/* SDK 58 redirects href:null/hidden screens. BottomNavigation alone selects the five tab buttons. */}
    <Tabs.Screen name="connect" options={{ title: 'Join a group' }} />
    <Tabs.Screen name="requests" options={{ title: 'Join requests' }} />
    <Tabs.Screen name="notifications" options={{ title: 'Notifications' }} />
    <Tabs.Screen name="nearby" options={{ title: 'Nearby members' }} />
    <Tabs.Screen name="sharing" options={{ title: 'Location sharing' }} />
    <Tabs.Screen name="chat" options={{ title: 'Group chat' }} />
    <Tabs.Screen name="guide" options={{ title: 'Getting started' }} />
  </Tabs>;
}
