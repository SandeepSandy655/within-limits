import { useRef, useState } from 'react';
import { Share, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { useDevice } from '@/providers/DeviceProvider';
import { AppIcon } from '@/components/AppIcon';
import { SectionSwitch, pairSections } from '@/components/AppNavigation';
import { Button, EmptyState, ErrorNotice, Page, colors, ui } from '@/components/ui';
import { formatConnectionCode } from '@/services/deviceStorage';
import { groupCapacity, invitationLink } from '@/services/pairing';
import { getRegisteredDevice } from '@/services/deviceService';
import { useNow } from '@/hooks/use-now';

export default function InviteScreen() {
  const device = useDevice(); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false); const lock = useRef(false);
  const now = useNow(device);
  const { memberConnection: outgoing, joined, pending, full } = groupCapacity(device.connections, device.profile?.deviceId, now);
  const code = device.profile?.connectionCode;
  async function currentCode() {
    if (!device.profile) throw new Error('Wait for your device to connect.');
    const registered = await getRegisteredDevice(device.profile.deviceId);
    if (!registered.connectionCode) { await device.refresh(); throw new Error('Only a host with an available space can share an invitation.'); }
    return registered.connectionCode;
  }
  async function run(action: () => Promise<unknown>) { if (lock.current) return; lock.current = true; setBusy(true); setError(''); setNotice(''); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not share your invitation.'); } finally { lock.current = false; setBusy(false); } }
  return <Page><SectionSwitch selected="host" items={pairSections} />
    <View style={{ gap: 5 }}><Text style={ui.title}>Better together.</Text><Text style={ui.subtitle}>One scan is all it takes to find your group.</Text></View>
    <ErrorNotice message={error || device.error} />
    {device.loading || !device.connectionsReady ? <EmptyState icon="shield" title="Checking your group" description="Your invitation is available after your connection status is confirmed.">{!device.loading && <Button title="Retry connection" onPress={device.retry} />}</EmptyState>
      : outgoing ? <EmptyState icon="group" title="Only your host can invite devices" description="You’re a member of another host’s group. Members cannot reveal a QR code, share their own invitation, or host another device while connected."><Button title="View your connection" onPress={() => router.navigate('/connect')} /></EmptyState> : <>
      <View style={[ui.card, { alignItems: 'center', paddingVertical: 25, borderColor: '#CFE5DC' }]}>
        <View style={[ui.row, { gap: 7 }]}><AppIcon name="shield" size={16} color={colors.green} /><Text style={[ui.label, { color: colors.green }]}>YOUR PRIVATE INVITATION</Text></View>
        {full ? <EmptyState icon="group" title="Your group is full" description="All four spaces, including the host, are joined or reserved. Another device cannot join until a space is available."><Button title="Manage group" onPress={() => router.navigate('/connections')} /></EmptyState> : code && !device.error ? <>
          <View style={{ padding: 20, borderRadius: 24, backgroundColor: colors.white, borderWidth: 2, borderColor: colors.mint }}><QRCode value={invitationLink(code)} size={184} color={colors.ink} backgroundColor="#FFFFFF" /></View>
          <Text style={ui.small}>Or share your 8-digit code</Text><Text selectable style={{ color: colors.ink, fontSize: 32, letterSpacing: 5, fontWeight: '800' }}>{formatConnectionCode(code)}</Text>
          <View style={[ui.row, { width: '100%' }]}><View style={{ flex: 1 }}><Button title="Copy" icon="copy" secondary disabled={busy} onPress={() => void run(async () => { await Clipboard.setStringAsync(await currentCode()); setNotice('Invitation code copied.'); })} /></View><View style={{ flex: 1 }}><Button title="Share" icon="share" disabled={busy} onPress={() => void run(async () => { const invitationCode = await currentCode(); await Share.share({ message: `Join ${device.profile!.deviceName} on Within Limits. Code: ${formatConnectionCode(invitationCode)}. ${invitationLink(invitationCode)}. Your host will approve your request and choose a connection range.` }); })} /></View></View>
        </> : <><Text style={ui.subtitle}>Your invitation will appear when this device connects.</Text><Button title="Retry connection" onPress={device.retry} /></>}
        {!!notice && <Text accessibilityLiveRegion="polite" style={[ui.body, { color: colors.green }]}>{notice}</Text>}
      </View>
      <View style={[ui.card, { padding: 17 }]}><View style={ui.between}><Text style={[ui.body, { fontWeight: '800' }]}>Your four-device circle</Text><Text style={ui.small}>{joined + 1}/4 joined</Text></View><View style={ui.row}>{Array.from({ length: 4 }, (_, i) => <View key={i} style={{ flex: 1, alignItems: 'center', gap: 7 }}><View style={[ui.avatar, { width: 43, height: 43, borderRadius: 22, backgroundColor: i <= joined ? colors.mint : colors.bg }]}><AppIcon name={i === 0 ? 'shield' : i <= joined ? 'check' : i <= joined + pending ? 'bell' : 'plus'} color={i <= joined ? colors.green : colors.muted} size={20} /></View><Text style={ui.small}>{i === 0 ? 'You' : i <= joined ? 'Joined' : i <= joined + pending ? 'Pending' : 'Open'}</Text></View>)}</View></View>
      <Text style={[ui.small, { textAlign: 'center' }]}>You approve every request. The host counts as one device.</Text>
    </>}
  </Page>;
}
