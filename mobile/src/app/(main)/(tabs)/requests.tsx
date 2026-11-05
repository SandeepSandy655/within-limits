import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SectionSwitch, groupSections } from '@/components/AppNavigation';
import { Button, EmptyState, ErrorNotice, Page, colors, ui } from '@/components/ui';
import { useDevice } from '@/providers/DeviceProvider';
import { acceptConnection, CONNECTION_RANGES_METERS, rejectConnection } from '@/services/connectionService';
import { isActiveConnection } from '@/services/pairing';
import { useNow } from '@/hooks/use-now';

export default function RequestsScreen() {
  const device = useDevice(); const [busy, setBusy] = useState<string | null>(null); const lock = useRef(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [ranges, setRanges] = useState<Record<string, number>>({}); const now = useNow(device);
  const requests = device.connections.filter((c) => c.receiverId === device.profile?.deviceId && c.status === 'pending' && isActiveConnection(c, now));
  const joined = device.connections.filter((c) => c.receiverId === device.profile?.deviceId && c.status === 'accepted').length;
  async function decide(id: string, accept: boolean) {
    if (!device.profile || lock.current) return;
    lock.current = true; setBusy(id); setError(''); setNotice('');
    try {
      if (accept) await acceptConnection(id, device.profile.deviceId, ranges[id]);
      else await rejectConnection(id, device.profile.deviceId);
      await device.refresh();
      setNotice(accept ? `Member added with a ${ranges[id] / 1000} km range. You’ll be alerted if they go out of reach.` : 'Request declined. The reserved space is available again.');
      setRanges((current) => { const next = { ...current }; delete next[id]; return next; });
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to respond.'); await device.refresh(); }
    finally { setBusy(null); lock.current = false; }
  }
  return <Page><SectionSwitch selected="requests" items={groupSections} /><View style={{ gap: 5 }}><Text style={ui.title}>A place in your circle.</Text><Text style={ui.subtitle}>Approve people you recognise. Requests reserve a space for up to 10 minutes.</Text></View>
    <View style={ui.notice}><Text style={ui.body}>{joined + 1}/4 devices joined · {requests.length} waiting</Text><Text style={ui.small}>The host counts as one device. You can invite up to three companions.</Text></View>
    <ErrorNotice message={error || device.error} />{notice ? <Text accessibilityLiveRegion="polite" style={ui.body}>{notice}</Text> : null}
    {requests.length ? requests.map((request) => <View key={request._id} style={[ui.card, { borderColor: '#DCDCF0' }]}>
      <View style={ui.row}><View style={[ui.avatar, { backgroundColor: colors.blue }]}><Text style={[ui.heading, { color: colors.purple }]}>{(request.requesterName || '?').slice(0, 1).toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text style={ui.heading}>{request.requesterName || 'New member'}</Text><Text style={ui.small}>Would like to join your group</Text></View></View>
      <Text style={ui.label}>CHOOSE THIS MEMBER’S RANGE</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={`Connection range for ${request.requesterName || 'new member'}`} style={ui.row}>
        {CONNECTION_RANGES_METERS.map((range) => <Pressable key={range} accessibilityRole="radio" accessibilityLabel={`${range / 1000} km range`} accessibilityState={{ checked: ranges[request._id] === range, disabled: !!busy }} disabled={!!busy}
          onPress={() => setRanges((current) => ({ ...current, [request._id]: range }))}
          style={[ui.button, { flex: 1, backgroundColor: ranges[request._id] === range ? colors.green : colors.bg }]}>
          <Text style={[ui.buttonText, { color: ranges[request._id] === range ? colors.white : colors.ink }]}>{range / 1000} km</Text>
        </Pressable>)}
      </View>
      <Text style={ui.small}>You’ll get an alert if this member leaves the selected range. Their position will be hidden from Map and Nearby until they return.</Text>
      <View style={ui.row}><View style={{ flex: 1 }}><Button title="Decline" secondary disabled={!!busy} onPress={() => void decide(request._id, false)} /></View><View style={{ flex: 1 }}><Button title="Approve" icon="check" busy={busy === request._id} disabled={!!busy || joined >= 3 || !ranges[request._id]} onPress={() => void decide(request._id, true)} /></View></View>
    </View>) : <EmptyState icon="bell" title="You’re all caught up" description="Share your invitation from Pair. New join requests will appear here automatically."><Button title="Open your invitation" icon="pair" onPress={() => router.navigate('/invite')} /></EmptyState>}
    <Button title="Refresh requests" secondary disabled={!!busy} onPress={() => void device.refresh()} />
  </Page>;
}
