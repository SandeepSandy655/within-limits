import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useNavigation, usePathname, type Href } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { DrawerContentScrollView, type DrawerContentComponentProps } from 'expo-router/drawer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/providers/AuthProvider';
import { useDevice } from '@/providers/DeviceProvider';
import { AppIcon, type IconName } from './AppIcon';
import { colors, IconButton, StatusPill, ui } from './ui';

const sections: { name: string; label: string; icon: IconName; href: Href }[] = [
  { name: 'index', label: 'Home', icon: 'home', href: '/' },
  { name: 'locations', label: 'Map', icon: 'map', href: '/locations' },
  { name: 'invite', label: 'Pair', icon: 'pair', href: '/invite' },
  { name: 'connections', label: 'Group', icon: 'group', href: '/connections' },
  { name: 'account', label: 'Account', icon: 'account', href: '/account' },
];
const titles: Record<string, string> = { '/': 'Dashboard', '/locations': 'Live map', '/invite': 'Pair devices', '/connect': 'Pair devices', '/connections': 'Your group', '/requests': 'Join requests', '/notifications': 'Notifications', '/account': 'Your account', '/nearby': 'Nearby members', '/guide': 'Getting started', '/sharing': 'Location sharing', '/chat': 'Group chat' };
function sectionForRoute(route: string) { return route === 'connect' ? 'invite' : ['requests', 'nearby', 'notifications', 'chat'].includes(route) ? 'connections' : ['guide', 'sharing'].includes(route) ? 'account' : route; }

export function AppHeader() {
  const navigation = useNavigation();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const device = useDevice();
  return <View style={{ backgroundColor: colors.bg, paddingTop: insets.top }}><View style={[styles.header, { maxWidth: 800 }]}>
    <IconButton icon="menu" label="Open dashboard menu" onPress={() => navigation.dispatch({ type: 'OPEN_DRAWER' })} />
    <View style={{ flex: 1, gap: 3 }}><Text style={[ui.label, { color: colors.green, letterSpacing: 2 }]}>WITHIN LIMITS</Text><Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>{titles[pathname] || 'Your group'}</Text></View>
    <IconButton icon="bell" label={`Notifications${device.unreadCount ? `, ${device.unreadCount} unread` : ''}`} badge={device.unreadCount} onPress={() => router.navigate('/notifications')} />
  </View></View>;
}

export function BottomNavigation({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const selected = sectionForRoute(state.routes[state.index].name);
  if (keyboardVisible && Platform.OS !== 'web') return null;
  return <View style={[styles.tabFrame, { paddingBottom: Math.max(insets.bottom, 10) }]}><View accessibilityRole="tablist" style={styles.tabs}>
    {sections.map((section) => {
      const route = state.routes.find((item) => item.name === section.name);
      const focused = selected === section.name;
      if (!route) return null;
      return <Pressable key={section.name} accessibilityRole="tab" accessibilityLabel={section.label} accessibilityState={{ selected: focused }} onPress={() => {
        const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
        if (!event.defaultPrevented) navigateToTab(route.key);
      }} onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })} style={({ pressed }) => [styles.tab, { opacity: pressed ? 0.6 : 1 }]}>
        <View style={[styles.tabIcon, { backgroundColor: focused ? colors.mint : 'transparent' }]}><AppIcon name={section.icon} size={22} color={focused ? colors.green : colors.muted} strokeWidth={focused ? 2.2 : 1.7} /></View>
        <Text style={{ color: focused ? colors.green : colors.muted, fontSize: 10, fontWeight: focused ? '800' : '600' }}>{section.label}</Text>
      </Pressable>;
    })}
  </View></View>;
}

export function AppDrawer(props: DrawerContentComponentProps) {
  const auth = useAuth(); const device = useDevice(); const pathname = usePathname();
  const selected = sectionForRoute(pathname.slice(1) || 'index');
  const name = auth.user?.displayName || auth.user?.email?.split('@')[0] || 'Explorer';
  const pending = device.connections.filter((c) => c.receiverId === device.profile?.deviceId && c.status === 'pending').length;
  const go = (href: Href) => { props.navigation.closeDrawer(); router.navigate(href); };
  const extra: { label: string; icon: IconName; href: Href; count?: number }[] = [
    { label: 'Group chat', icon: 'chat', href: '/chat', count: device.chat.unreadCount },
    { label: 'Notifications', icon: 'bell', href: '/notifications', count: device.unreadCount },
    { label: 'Join requests', icon: 'group', href: '/requests', count: pending },
    { label: 'Nearby members', icon: 'compass', href: '/nearby' },
    { label: 'Getting started', icon: 'help', href: '/guide' },
  ];
  return <DrawerContentScrollView {...props} contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingBottom: 24 }}>
    <View style={[ui.between, { marginBottom: 28, marginTop: 12 }]}><View style={[ui.avatar, { backgroundColor: colors.green }]}><AppIcon name="compass" color={colors.lime} size={28} /></View><IconButton icon="close" label="Close dashboard menu" onPress={() => props.navigation.closeDrawer()} /></View>
    <Text style={[ui.title, { fontSize: 26 }]}>Go together.</Text><Text style={[ui.subtitle, { marginBottom: 24 }]}>A place for your people.</Text>
    <View style={[ui.card, { backgroundColor: colors.bg, padding: 14, marginBottom: 24 }]}><View style={ui.row}><View style={[ui.avatar, { backgroundColor: colors.blue }]}><Text style={[ui.heading, { color: colors.purple }]}>{name.slice(0, 1).toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text numberOfLines={1} style={[ui.body, { fontWeight: '800' }]}>{name}</Text><Text numberOfLines={1} style={ui.small}>{device.profile?.deviceName || 'Your device'}</Text></View></View><StatusPill active={device.online} label={device.online ? 'Connected to your group' : 'Waiting for connection'} /></View>
    <Text style={[ui.label, { marginBottom: 10 }]}>EXPLORE</Text>
    {sections.map((section) => <Pressable key={section.name} accessibilityRole="button" accessibilityState={{ selected: selected === section.name }} onPress={() => go(section.href)} style={[styles.drawerLink, selected === section.name && { backgroundColor: colors.mint }]}><AppIcon name={section.icon} color={selected === section.name ? colors.green : colors.muted} /><Text style={[ui.body, { fontWeight: '700', flex: 1, color: selected === section.name ? colors.green : colors.ink }]}>{section.label === 'Home' ? 'Dashboard' : section.label}</Text><AppIcon name="chevron" size={15} color={colors.muted} /></Pressable>)}
    <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 18 }} /><Text style={[ui.label, { marginBottom: 10 }]}>QUICK ACCESS</Text>
    {extra.map((item) => <Pressable key={item.label} accessibilityRole="button" onPress={() => go(item.href)} style={styles.drawerLink}><AppIcon name={item.icon} color={colors.muted} /><Text style={[ui.body, { flex: 1 }]}>{item.label}</Text>{!!item.count && <Text style={{ color: colors.green, fontWeight: '800' }}>{item.count}</Text>}</Pressable>)}
    <View style={{ flex: 1, minHeight: 30 }} /><View style={[ui.row, { paddingTop: 20 }]}><AppIcon name="shield" color={colors.green} size={19} /><Text style={[ui.small, { flex: 1 }]}>Up to four devices. Sharing stays in your control.</Text></View>
  </DrawerContentScrollView>;
}

export function SectionSwitch({ selected, items }: { selected: string; items: readonly { label: string; href: Href; value: string }[] }) {
  return <View accessibilityRole="tablist" style={{ flexDirection: 'row', padding: 5, backgroundColor: '#EAF0F4', borderRadius: 16, gap: 5 }}>{items.map((item) => <Pressable key={item.value} accessibilityRole="tab" accessibilityState={{ selected: selected === item.value }} onPress={() => router.navigate(item.href)} style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: selected === item.value ? colors.white : 'transparent' }}><Text style={{ fontSize: 13, fontWeight: '700', color: selected === item.value ? colors.ink : colors.muted }}>{item.label}</Text></Pressable>)}</View>;
}
export const pairSections = [{ label: 'Host a group', href: '/invite', value: 'host' }, { label: 'Join a group', href: '/connect', value: 'join' }] as const;
export const groupSections = [{ label: 'Members', href: '/connections', value: 'members' }, { label: 'Requests', href: '/requests', value: 'requests' }, { label: 'Chat', href: '/chat', value: 'chat' }] as const;

const styles = StyleSheet.create({
  header: { width: '100%', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12 },
  tabFrame: { backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 6 },
  tabs: { width: '100%', maxWidth: 760, alignSelf: 'center', flexDirection: 'row', paddingHorizontal: 8 },
  tab: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 3, minHeight: 58 },
  tabIcon: { width: 52, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  drawerLink: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 12, minHeight: 49, borderRadius: 14, marginBottom: 3 },
});
