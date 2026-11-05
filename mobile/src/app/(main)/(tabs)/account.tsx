import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/providers/AuthProvider';
import { useDevice } from '@/providers/DeviceProvider';
import { AppIcon } from '@/components/AppIcon';
import { Button, ErrorNotice, Field, Page, StatusPill, colors, ui } from '@/components/ui';
import { groupCapacity } from '@/services/pairing';
import { useNow } from '@/hooks/use-now';
import { CAN_CONFIGURE_BACKEND } from '@/services/serverConfig';

export default function AccountScreen() {
  const auth = useAuth(); const device = useDevice(); const [editing, setEditing] = useState(false); const [name, setName] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const lock = useRef(false);
  const now = useNow(device);
  const capacity = groupCapacity(device.connections, device.profile?.deviceId, now);
  const needsLocation = !device.sharing || device.locationAvailable === false;
  const displayName = auth.user?.displayName || auth.user?.email?.split('@')[0] || 'Explorer';
  async function run(action: () => Promise<void>) { if (lock.current) return; lock.current = true; setBusy(true); setError(''); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); } finally { lock.current = false; setBusy(false); } }
  return <Page>
    <View style={{ alignItems: 'center', gap: 10, paddingVertical: 16 }}><View style={{ width: 80, height: 80, borderRadius: 28, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-4deg' }] }}><Text style={{ color: colors.lime, fontSize: 32, fontWeight: '800' }}>{displayName.slice(0, 1).toUpperCase()}</Text></View><Text style={[ui.title, { fontSize: 26 }]}>{displayName}</Text><Text style={ui.small}>{auth.user?.email}</Text><StatusPill active label="Verified account" /></View>
    <ErrorNotice message={error} />
    <View style={ui.card}><View style={ui.between}><Text style={ui.label}>THIS DEVICE</Text><AppIcon name="account" color={colors.green} /></View><Text style={ui.heading}>{device.profile?.deviceName || 'Connecting your device'}</Text><Text style={ui.small}>This is the name your group sees.</Text>
      {editing ? <><Field label="DEVICE NAME" value={name} onChangeText={setName} maxLength={32} /><Button title="Save name" busy={busy} onPress={() => void run(async () => { await device.rename(name); setEditing(false); })} /><Button title="Cancel" secondary disabled={busy} onPress={() => setEditing(false)} /></> : <Button title="Edit device name" secondary disabled={!device.profile} onPress={() => { setName(device.profile?.deviceName || ''); setEditing(true); }} />}
    </View>
    <View style={ui.card}><Text style={ui.label}>SUBSCRIPTION</Text>
      <View style={ui.between}><Text style={ui.heading}>Your small circle</Text><StatusPill active label="Free plan" /></View>
      <Text style={ui.body}>Up to 4 devices, including the host.</Text>
      <Text style={ui.small}>{capacity.memberConnection ? 'Your host manages this group’s device spaces. Members cannot invite or host other devices.' : !device.connectionsReady ? 'Checking device spaces…' : `${capacity.joined + 1}/4 devices connected${capacity.pending ? ` · ${capacity.pending} reserved` : ''}. ${capacity.full ? 'Your group is full. Another device cannot join until a space is available.' : 'Pending requests reserve a space for up to 10 minutes.'}`}</Text>
      <Button title="Manage devices" secondary disabled={!device.profile} onPress={() => router.navigate('/connections')} />
      <View style={[ui.notice, { backgroundColor: colors.blue }]}><View style={ui.row}><AppIcon name="plus" color={colors.purple} /><Text style={[ui.body, { fontWeight: '800' }]}>More room for your people</Text></View><Text style={ui.small}>A subscription to connect more devices is coming soon.</Text><Button title="Upgrade · Coming soon" disabled onPress={() => undefined} /></View>
    </View>
    <View style={ui.card}><Text style={ui.label}>CONNECTION & PRIVACY</Text><View style={ui.between}><View style={ui.row}><AppIcon name="wifi" color={colors.green} /><Text style={ui.body}>Group connection</Text></View><StatusPill active={device.online} label={device.online ? 'Online' : 'Offline'} /></View><View style={ui.between}><View style={ui.row}><AppIcon name="location" color={colors.green} /><Text style={ui.body}>Location sharing</Text></View><Text style={[ui.small, { color: needsLocation ? colors.muted : colors.green }]}>{!device.sharing ? 'Paused' : device.locationAvailable === false ? 'Location is off' : 'Enabled'}</Text></View><Text style={ui.small}>Only approved connections within the host’s selected range can see your shared location. Tracking pauses when the app goes into the background.</Text>
      {needsLocation && <Button title="Turn on location sharing" secondary busy={busy || device.locationRequestPending} disabled={!device.profile} onPress={() => void run(device.enableSharing)} />}
    </View>
    <Pressable accessibilityRole="button" onPress={() => router.navigate('/guide')} style={[ui.card, ui.row]}><AppIcon name="help" color={colors.purple} /><View style={{ flex: 1 }}><Text style={[ui.body, { fontWeight: '800' }]}>A little help getting started</Text><Text style={ui.small}>Pairing, permissions and your first trip</Text></View><AppIcon name="chevron" size={17} /></Pressable>
    <Button title="Sign out" icon="logout" secondary busy={busy} onPress={() => void run(async () => { try { if (device.sharing) await device.toggleSharing(); } finally { await auth.logout(); } })} />
    {CAN_CONFIGURE_BACKEND && <Button title="Connection settings" icon="wifi" secondary onPress={() => router.push('/server-settings')} />}
    <Text style={[ui.small, { textAlign: 'center' }]}>WITHIN LIMITS · Made for your small circle</Text>
  </Page>;
}
