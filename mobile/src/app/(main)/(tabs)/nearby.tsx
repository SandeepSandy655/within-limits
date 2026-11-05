import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useDevice } from '@/providers/DeviceProvider';
import { useNow } from '@/hooks/use-now';
import { locationFreshness, visibleGroupDevices } from '@/services/locationFormat';
import { AppIcon } from '@/components/AppIcon';
import { Button, EmptyState, Page, colors, ui } from '@/components/ui';

export default function NearbyScreen() {
  const device = useDevice(); const now = useNow(device);
  const ready = device.sharing && device.locationAvailable && device.location && device.location.accuracy != null && device.location.accuracy <= 100 && locationFreshness(device.location.timestamp, now, device.online) === 'Live location';
  const nearby = visibleGroupDevices(device.devices, ready ? device.location : null, device.online, now);
  return <Page><Text style={ui.title}>Closer than you think.</Text><Text style={ui.subtitle}>Approved connections within the 1 km or 2 km range chosen by the host, using recent and accurate GPS.</Text>
    {!ready ? <EmptyState icon="location" title="A fresh location is needed" description="Turn on sharing and wait for a GPS fix to see which connected members are nearby."><Button title="Open sharing controls" onPress={() => router.navigate('/sharing')} /></EmptyState> : nearby.length ? nearby.map((peer) => <View key={peer.deviceId} style={[ui.card, ui.row]}><View style={ui.avatar}><AppIcon name="compass" color={colors.green} /></View><View style={{ flex: 1 }}><Text style={ui.heading}>{peer.deviceName}</Text><Text style={ui.small}>About {peer.distance < 1000 ? `${Math.round(peer.distance)} m` : `${(peer.distance / 1000).toFixed(1)} km`} away</Text></View></View>) : <EmptyState icon="compass" title="No members nearby yet" description="Keep your group’s apps open with sharing enabled. Recent positions appear here automatically." />}
    <Button title="Open group map" icon="map" onPress={() => router.navigate('/locations')} />
  </Page>;
}
