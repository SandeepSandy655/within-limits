import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { AppIcon } from '@/components/AppIcon';
import GroupMap from '@/components/GroupMap';
import type { MapMarker } from '@/components/mapHtml';
import { Button, ErrorNotice, IconButton, StatusPill, colors, ui } from '@/components/ui';
import { useDevice } from '@/providers/DeviceProvider';
import { locationFreshness, updatedLabel, visibleGroupDevices } from '@/services/locationFormat';
import { useNow } from '@/hooks/use-now';

export default function LocationsScreen() {
  const device = useDevice(); const now = useNow(device);
  const [mapError, setMapError] = useState(false); const [version, setVersion] = useState(0); const [fit, setFit] = useState(0);
  const [expanded, setExpanded] = useState(true);
  const { requestMapLocation, loading } = device;
  const deviceId = device.profile?.deviceId;
  useFocusEffect(useCallback(() => {
    if (!loading && deviceId) void requestMapLocation().catch(() => undefined);
  }, [loading, deviceId, requestMapLocation]));
  const onError = useCallback(() => setMapError(true), []);
  const visible = visibleGroupDevices(device.devices, device.sharing && device.locationAvailable ? device.location : null, device.online, now);
  const markers: MapMarker[] = [
    ...(device.location ? [{ id: 'self', name: 'You', latitude: device.location.latitude, longitude: device.location.longitude, self: true, stale: locationFreshness(device.location.timestamp, now, device.online) !== 'Live location', status: locationFreshness(device.location.timestamp, now, device.online) }] : []),
    ...visible.map((peer) => ({ id: peer.deviceId, name: peer.deviceName, latitude: peer.location!.coordinates[1], longitude: peer.location!.coordinates[0], stale: false, status: `Within ${(peer.rangeMeters || 1000) / 1000} km · ${updatedLabel(peer.locationUpdatedAt, now)}${peer.accuracy != null ? ` · ±${Math.round(peer.accuracy)} m` : ''}` })),
  ];
  return <View style={ui.page}>
    <View style={{ flex: 1, minHeight: 180 }}><GroupMap key={version} markers={markers} fitVersion={fit} onError={onError} /><View pointerEvents="box-none" style={{ position: 'absolute', top: 16, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}><View style={{ backgroundColor: colors.white, padding: 12, borderRadius: 17, gap: 7 }}><StatusPill active={device.online} label={device.online ? 'Live connection' : 'Reconnecting'} /><Text style={ui.small}>{markers.length} shared location{markers.length === 1 ? '' : 's'}</Text></View><IconButton icon="compass" label="Fit map to your group" onPress={() => setFit((n) => n + 1)} /></View></View>
    <View style={{ backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -18, paddingTop: 8, overflow: 'hidden' }}><Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Collapse map details' : 'Expand map details'} accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={{ alignItems: 'center', minHeight: 42, gap: 8, paddingBottom: 8 }}><View style={{ height: 4, width: 38, borderRadius: 3, backgroundColor: colors.line }} /><Text style={[ui.body, { fontWeight: '800' }]}>Your group, at a glance {expanded ? '⌄' : '⌃'}</Text></Pressable>
    {expanded && <ScrollView style={{ maxHeight: 190 }} contentContainerStyle={{ padding: 18, paddingTop: 4, gap: 10 }}>
      <ErrorNotice message={device.error || device.locationError} />
      {mapError && <><Text style={ui.body}>Map tiles could not load. Check your internet connection.</Text><Button title="Reload map" secondary onPress={() => { setMapError(false); setVersion((n) => n + 1); }} /></>}
      {!device.devices.length ? <View style={ui.row}><View style={ui.avatar}><AppIcon name="group" color={colors.green} /></View><View style={{ flex: 1 }}><Text style={[ui.body, { fontWeight: '700' }]}>Make your first connection</Text><Text style={ui.small}>Approved members appear when they share GPS within range.</Text></View></View> : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>{visible.map((peer) => <Pressable key={peer.deviceId} accessibilityRole="button" accessibilityLabel={`View ${peer.deviceName} in your group`} onPress={() => router.navigate('/connections')} style={{ backgroundColor: colors.bg, borderRadius: 14, padding: 12, minWidth: 135, gap: 5 }}><Text numberOfLines={1} style={[ui.body, { fontWeight: '700', maxWidth: 170 }]}>{peer.deviceName}</Text><Text style={ui.small}>Within {(peer.rangeMeters || 1000) / 1000} km</Text></Pressable>)}</ScrollView>}
      {device.devices.length > visible.length && <Text style={ui.small}>Members outside their range or without recent, accurate GPS are hidden. Open Group to contact them.</Text>}
      <Text style={ui.small}>Blue · You     Green · Within the host’s selected range</Text>
      {(!device.sharing || device.locationAvailable === false) && <Button title="Turn on location sharing" secondary icon="location" busy={device.locationRequestPending} disabled={!device.profile} onPress={() => { void device.enableSharing().catch(() => undefined); }} />}
    </ScrollView>}</View>
  </View>;
}
