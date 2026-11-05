import { Drawer } from 'expo-router/drawer';
import { AppDrawer } from '@/components/AppNavigation';
import { colors } from '@/components/ui';
import { DeviceProvider } from '@/providers/DeviceProvider';
import { useAuth } from '@/providers/AuthProvider';
import { InviteLinkHandler } from '@/components/InviteLinkHandler';

export default function MainLayout() {
  const { user } = useAuth();
  return <DeviceProvider key={user?.uid}><Drawer drawerContent={(props) => <AppDrawer {...props} />} screenOptions={{ headerShown: false, drawerPosition: 'left', drawerType: 'front', swipeEnabled: true, swipeEdgeWidth: 36, overlayColor: 'rgba(10, 27, 40, 0.4)', drawerStyle: { width: 300, backgroundColor: colors.white } }}>
    <Drawer.Screen name="(tabs)" options={{ title: 'Dashboard' }} />
  </Drawer><InviteLinkHandler /></DeviceProvider>;
}
