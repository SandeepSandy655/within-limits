import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { useDevice } from '@/providers/DeviceProvider';
import { useAuth } from '@/providers/AuthProvider';
import { AppIcon, decorativeSvgProps } from '@/components/AppIcon';
import { Button, ErrorNotice, Page, StatusPill, colors, ui } from '@/components/ui';
import { locationFreshness } from '@/services/locationFormat';
import { useNow } from '@/hooks/use-now';

export default function HomeScreen() {
  const device = useDevice(); const auth = useAuth(); const now = useNow(device);
  const [busy, setBusy] = useState(false); const lock = useRef(false); const [error, setError] = useState('');
  const links = device.connections.filter((c) => c.status === 'accepted');
  const outgoing = device.connections.find((c) => c.requesterId === device.profile?.deviceId && ['accepted', 'pending'].includes(c.status));
  const incoming = device.connections.filter((c) => c.receiverId === device.profile?.deviceId && c.status === 'pending');
  const firstName = auth.user?.displayName?.split(' ')[0] || auth.user?.email?.split('@')[0] || 'explorer';
  const live = device.sharing && locationFreshness(device.location?.timestamp, now, device.online) === 'Live location';
  const sharingEnabled = device.sharing && device.locationAvailable === true;
  async function toggleSharing() { if (lock.current) return; lock.current = true; setBusy(true); setError(''); try { if (sharingEnabled) await device.toggleSharing(); else await device.enableSharing(); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to change location sharing.'); } finally { lock.current = false; setBusy(false); } }
  return <Page>
    <View style={ui.between}><View style={{ flex: 1, gap: 3 }}><Text style={ui.subtitle}>Good to see you,</Text><Text numberOfLines={1} style={[ui.title, { fontSize: 27, lineHeight: 34 }]}>{firstName} <Text style={{ color: colors.green }}>↗</Text></Text></View><StatusPill active={device.online} label={device.online ? 'Connected' : 'Connecting'} /></View>
    <Pressable accessibilityRole="button" accessibilityLabel="Connect to each other" onPress={() => router.navigate(outgoing ? '/connect' : '/invite')} style={styles.hero}>
      <View style={styles.art} pointerEvents="none"><Svg width="170" height="210" viewBox="0 0 170 210" {...decorativeSvgProps}><Circle cx="108" cy="92" r="75" stroke="#365B65" strokeWidth="1" fill="none" /><Circle cx="108" cy="92" r="47" stroke="#365B65" strokeWidth="1" fill="none" /><Path d="M18 191C30 156 97 187 108 132S46 111 61 62s73 4 93-55" stroke="#91D8BA" strokeWidth="3" strokeDasharray="5 8" fill="none" /><Circle cx="62" cy="62" r="13" fill="#FFAA88" /><Circle cx="62" cy="62" r="4" fill="#172B3A" /><Circle cx="107" cy="132" r="17" fill="#DDF49B" /><Circle cx="107" cy="132" r="5" fill="#172B3A" /></Svg></View>
      <Text style={[ui.label, { color: colors.lime }]}>LITTLE GROUP. BIG PLANS.</Text><Text style={styles.heroTitle}>Stay close.{"\n"}Go further.</Text>
      <Text style={{ color: '#BDD5DC', fontSize: 13, lineHeight: 20, maxWidth: '65%' }}>{outgoing?.status === 'pending' ? 'Your host is reviewing your request.' : outgoing ? `Connected with ${outgoing.receiverName || 'your host'}.` : `${links.length + 1} of 4 devices. Room for your next adventure.`}</Text>
      <View style={[ui.row, { marginTop: 8, gap: 7 }]}><Text style={{ color: colors.white, fontSize: 13, fontWeight: '800' }}>Connect to each other</Text><AppIcon name="arrow" size={17} color={colors.lime} /></View>
    </Pressable>
    <View style={ui.row}>
      <Pressable accessibilityRole="button" onPress={() => router.navigate('/connections')} style={[styles.quick, { backgroundColor: colors.blue }]}><AppIcon name="group" color={colors.purple} /><Text style={[ui.heading, { fontSize: 16 }]}>Your group</Text><Text style={ui.small}>{outgoing ? 'View your host' : `${links.length} companion${links.length === 1 ? '' : 's'} connected`}</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.navigate(outgoing ? '/connect' : '/invite')} style={[styles.quick, { backgroundColor: '#FFF0E8' }]}><AppIcon name="pair" color="#A26040" /><Text style={[ui.heading, { fontSize: 16 }]}>{outgoing ? 'Your invitation' : 'Bring a friend'}</Text><Text style={ui.small}>{outgoing?.status === 'pending' ? 'Check join request' : 'Scan. Connect. Go.'}</Text></Pressable>
    </View>
    <ErrorNotice message={device.error || error} />
    {device.loading && <ActivityIndicator color={colors.green} />}
    {!device.profile && !device.loading ? <Button title="Retry device setup" icon="refresh" onPress={device.retry} /> : <View style={ui.card}>
      <View style={ui.between}><View style={ui.row}><View style={[ui.avatar, { backgroundColor: live ? colors.mint : colors.bg }]}><AppIcon name="location" color={live ? colors.green : colors.muted} /></View><View><Text style={[ui.heading, { fontSize: 17 }]}>Location sharing</Text><Text style={ui.small}>{!device.sharing ? 'You’re in control' : !device.online ? 'Waiting for connection' : device.locationError ? 'GPS needs attention' : live ? 'Sharing with your group' : 'Finding your position'}</Text></View></View><View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: live ? colors.green : colors.coral }} /></View>
      <ErrorNotice message={device.locationError} />
      <Button title={sharingEnabled ? 'Pause sharing' : 'Turn on location sharing'} icon={sharingEnabled ? 'pause' : 'location'} secondary={sharingEnabled} disabled={!device.profile} busy={busy || device.locationRequestPending} onPress={() => void toggleSharing()} />
      <Text style={[ui.small, { textAlign: 'center' }]}>Shared with approved connections while the app is open.</Text>
    </View>}
    {incoming.length > 0 && <Pressable accessibilityRole="button" onPress={() => router.navigate('/requests')} style={[ui.notice, ui.row]}><AppIcon name="bell" color={colors.green} /><View style={{ flex: 1 }}><Text style={[ui.body, { fontWeight: '800' }]}>{incoming.length} request{incoming.length === 1 ? '' : 's'} waiting</Text><Text style={ui.small}>Someone wants to join your adventure.</Text></View><AppIcon name="arrow" size={18} color={colors.green} /></Pressable>}
  </Page>;
}
const styles = StyleSheet.create({ hero: { backgroundColor: '#173E4B', borderRadius: 24, padding: 24, gap: 12, overflow: 'hidden', minHeight: 224 }, heroTitle: { color: colors.white, fontSize: 36, lineHeight: 39, fontWeight: '800', letterSpacing: -1.5 }, art: { position: 'absolute', right: -20, top: 8, opacity: 0.9 }, quick: { flex: 1, padding: 17, borderRadius: 19, gap: 8, minHeight: 119 } });
