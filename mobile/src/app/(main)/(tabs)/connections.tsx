import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { SectionSwitch, groupSections } from '@/components/AppNavigation';
import { AppIcon } from '@/components/AppIcon';
import { Button, EmptyState, ErrorNotice, Page, StatusPill, colors, ui } from '@/components/ui';
import { useDevice } from '@/providers/DeviceProvider';
import { disconnectDevice, ringDevice } from '@/services/connectionService';
import { distanceMeters, locationFreshness, updatedLabel } from '@/services/locationFormat';
import { useNow } from '@/hooks/use-now';

export default function ConnectionsScreen() {
  const device = useDevice(); const now = useNow(device);
  const [busy, setBusy] = useState(''); const lock = useRef(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [removeId, setRemoveId] = useState('');
  const links = device.connections.filter((c) => c.status === 'accepted');
  const isMember = links.some((c) => c.requesterId === device.profile?.deviceId);
  async function run(id: string, action: () => Promise<void>) { if (lock.current) return; lock.current = true; setBusy(id); setError(''); setNotice(''); try { await action(); await device.refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); } finally { setBusy(''); lock.current = false; } }
  return <Page><SectionSwitch selected="members" items={groupSections} /><View style={ui.between}><View style={{ flex: 1, gap: 4 }}><Text style={ui.title}>Your small circle.</Text><Text style={ui.subtitle}>{isMember ? 'You and your group host.' : 'Good company, wherever you go.'}</Text></View><View style={{ padding: 12, borderRadius: 17, backgroundColor: colors.ink }}><Text style={{ color: colors.lime, fontSize: 22, fontWeight: '800' }}>{isMember ? links.length : links.length + 1}<Text style={{ color: '#B7CED8', fontSize: 13 }}>{isMember ? ' host' : '/4'}</Text></Text></View></View>
    <ErrorNotice message={error || device.error} />{notice ? <Text accessibilityLiveRegion="polite" style={ui.body}>{notice}</Text> : null}
    {links.length > 0 && <Button title={`Open group chat${device.chat.unreadCount ? ` · ${device.chat.unreadCount} unread` : ''}`} icon="chat" onPress={() => router.navigate('/chat')} />}
    <View style={[ui.card, ui.row, { padding: 15 }]}><View style={ui.avatar}><AppIcon name="account" color={colors.green} /></View><View style={{ flex: 1 }}><Text style={[ui.body, { fontWeight: '800' }]}>{device.profile?.deviceName || 'This device'} · You</Text><Text style={ui.small}>{isMember ? 'Group member' : 'Group host'} · {device.sharing ? 'Sharing enabled' : 'Sharing paused'}</Text></View><StatusPill label={device.online ? 'Online' : 'Offline'} active={device.online} /></View>
    {!links.length && <EmptyState icon="group" title="Save a place for your people" description="Invite up to three companions or join a host. Every connection starts with your approval."><Button title="Invite a companion" icon="plus" onPress={() => router.navigate('/invite')} /></EmptyState>}
    {links.map((link) => {
      const peerId = link.requesterId === device.profile?.deviceId ? link.receiverId : link.requesterId;
      const peer = device.devices.find((p) => p.deviceId === peerId);
      const name = peer?.deviceName || (isMember ? link.receiverName : link.requesterName) || 'Group member';
      const freshness = locationFreshness(peer?.locationUpdatedAt, now, peer?.status === 'online');
      const outOfReach = peer?.rangeState === 'out-of-range';
      const rangeMeters = link.rangeMeters || 1000;
      const accurate = peer?.accuracy != null && peer.accuracy <= 100 && device.location?.accuracy != null && device.location.accuracy <= 100;
      const coords = peer?.location?.coordinates;
      const distance = coords && device.location && freshness === 'Live location' && locationFreshness(device.location.timestamp, now, device.online) === 'Live location' && accurate ? distanceMeters(device.location, { latitude: coords[1], longitude: coords[0] }) : null;
      return <View key={link._id} style={ui.card}><View style={ui.between}><View style={[ui.row, { flex: 1 }]}><View style={[ui.avatar, { backgroundColor: colors.blue }]}><Text style={[ui.heading, { color: colors.purple }]}>{name.slice(0, 1).toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text style={[ui.heading, { fontSize: 17 }]}>{name}</Text><Text style={ui.small}>{isMember ? 'Your host' : 'Companion'}</Text></View></View><StatusPill label={peer?.status === 'online' ? 'Online' : 'Offline'} active={peer?.status === 'online'} /></View>
        <Text style={[ui.body, { color: outOfReach ? colors.danger : colors.ink, fontWeight: outOfReach ? '700' : '400' }]}>{outOfReach ? 'Out of reach — please contact them' : peer?.sharingEnabled === false ? 'Location sharing paused' : freshness}</Text>
        <Text style={ui.small}>Connection range · {rangeMeters / 1000} km from the host</Text>
        {outOfReach ? <Text style={ui.subtitle}>Their position is hidden from Map and Nearby until they return within range. You can still send them an alert.</Text> : <><Text style={ui.small}>{updatedLabel(peer?.locationUpdatedAt, now)}{peer?.accuracy != null ? ` · Accuracy ±${Math.round(peer.accuracy)} m` : ''}</Text><Text style={ui.subtitle}>{distance == null ? 'Distance needs fresh, accurate GPS on both devices.' : distance < 1000 ? `About ${Math.round(distance)} m away` : `About ${(distance / 1000).toFixed(1)} km away`}</Text></>}
        {removeId === link._id ? <View style={ui.notice}><Text style={ui.body}>{isMember ? 'Leave this group?' : `Remove ${name}?`} Location access between these devices will stop.</Text><Button title={isMember ? 'Leave group' : 'Remove member'} busy={busy === link._id} onPress={() => void run(link._id, async () => { await disconnectDevice(link._id, device.profile!.deviceId); setRemoveId(''); setNotice('Connection removed.'); })} /><Button title="Keep connection" secondary disabled={!!busy} onPress={() => setRemoveId('')} /></View> : <View style={ui.row}><View style={{ flex: 1 }}><Button title="Send alert" icon="bell" secondary busy={busy === peerId} disabled={!!busy || !device.online} onPress={() => void run(peerId, async () => { const result = await ringDevice(device.profile!.deviceId, peerId); setNotice(result.message); })} /></View><View style={{ flex: 1 }}><Button title={isMember ? 'Leave group' : 'Remove'} secondary disabled={!!busy} onPress={() => setRemoveId(link._id)} /></View></View>}
      </View>;
    })}
    {links.length > 0 && <Button title="See nearby members on the map" icon="map" onPress={() => router.navigate('/locations')} />}<Button title="Refresh group" icon="refresh" secondary disabled={!!busy} onPress={() => void device.refresh()} />
  </Page>;
}
