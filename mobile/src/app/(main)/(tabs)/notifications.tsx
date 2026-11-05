import { useCallback, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { AppIcon } from '@/components/AppIcon';
import { Button, EmptyState, ErrorNotice, Page, colors, ui } from '@/components/ui';
import { useDevice } from '@/providers/DeviceProvider';
import type { GroupNotification } from '@/services/notificationService';

export default function NotificationsScreen() {
  const device = useDevice();
  const { refreshNotifications } = device;
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const lock = useRef(false);
  useFocusEffect(useCallback(() => { void refreshNotifications(); }, [refreshNotifications]));
  async function read(ids: string[], notification?: GroupNotification) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      await device.markRead(ids);
      if (notification) router.navigate(notification.kind === 'connection-request' ? '/requests' : '/connections');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not mark notifications as read.'); }
    finally { lock.current = false; setBusy(false); }
  }
  const unread = device.notifications.filter((notification) => !notification.readAt);
  return <Page>
    <View style={{ gap: 5 }}><Text style={ui.title}>Updates from your circle.</Text><Text style={ui.subtitle}>Host alerts, range warnings and connection activity, all in one place.</Text></View>
    <ErrorNotice message={error || device.notificationError} />
    {unread.length > 0 && <Button title="Mark as read" secondary busy={busy} onPress={() => void read(unread.map((notification) => notification.id))} />}
    {device.notifications.length ? device.notifications.map((notification) => <Pressable key={notification.id}
      accessibilityRole="button" accessibilityLabel={`${notification.readAt ? '' : 'Unread. '}${notification.title}. ${notification.body}`}
      disabled={busy} onPress={() => void read(notification.readAt ? [] : [notification.id], notification)}
      style={[ui.card, { borderColor: notification.readAt ? colors.line : '#ABD7C8', backgroundColor: notification.readAt ? colors.white : '#F0FAF5' }]}>
      <View style={ui.row}><View style={[ui.avatar, { backgroundColor: notification.kind === 'out-of-range' ? '#FFF0E8' : colors.mint }]}><AppIcon name={notification.kind === 'out-of-range' ? 'location' : 'bell'} color={notification.kind === 'out-of-range' ? colors.amber : colors.green} /></View>
        <View style={{ flex: 1 }}><Text style={[ui.heading, { fontSize: 17 }]}>{notification.title}</Text><Text style={ui.small}>{new Date(notification.createdAt).toLocaleString()}</Text></View>
        {!notification.readAt && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green }} />}
      </View>
      <Text style={ui.body}>{notification.body}</Text><Text style={[ui.small, { color: colors.green, fontWeight: '700' }]}>{notification.kind === 'connection-request' ? 'View join request' : 'Open your group'} →</Text>
    </Pressable>) : <EmptyState icon="bell" title={device.loading ? 'Loading your updates' : 'No notifications yet'} description="When your host looks for you or someone goes out of range, their alert will appear here. Join requests also appear in Group → Requests." />}
    <Button title="Refresh notifications" icon="refresh" secondary disabled={busy || !device.profile} onPress={() => void device.refreshNotifications()} />
    <Text style={[ui.small, { textAlign: 'center' }]}>Alerts are saved here even while the app is closed.</Text>
  </Page>;
}
