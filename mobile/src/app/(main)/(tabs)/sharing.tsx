import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useDevice } from '@/providers/DeviceProvider';
import { Button, ErrorNotice, Page, StatusPill, ui } from '@/components/ui';

export default function SharingScreen() {
  const device = useDevice();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const enabled = device.sharing && device.locationAvailable === true;
  async function changeSharing() {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try { if (enabled) await device.toggleSharing(); else await device.enableSharing(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not change location sharing.'); }
    finally { locked.current = false; setBusy(false); }
  }
  return <Page>
    <Text style={ui.title}>Location sharing</Text>
    <Text style={ui.subtitle}>Control when your approved group can see your location.</Text>
    <View style={ui.card}>
      <StatusPill active={enabled} label={enabled ? 'Sharing is on' : device.sharing ? 'Location access is off' : 'Sharing is paused'} />
      <Text style={ui.body}>{enabled ? 'Keep the app open while GPS finds your position. Nearby needs a recent, accurate location on both devices.' : 'Turn on location access and Location Services to share while the app is open. Your phone will ask for any permission it needs.'}</Text>
      <Text style={ui.small}>Only approved connections within the host’s selected range see your position. Chat remains available outside that range.</Text>
      <ErrorNotice message={error || device.locationError || device.error} />
      <Button title={enabled ? 'Pause location sharing' : 'Turn on location sharing'} icon={enabled ? 'pause' : 'location'}
        busy={busy || device.locationRequestPending} disabled={!device.profile} onPress={() => void changeSharing()} />
      {!device.profile && <Button title="Retry device connection" secondary onPress={device.retry} />}
    </View>
    <Button title="See nearby members" secondary icon="compass" onPress={() => router.navigate('/nearby')} />
    <Button title="Open group map" secondary icon="map" onPress={() => router.navigate('/locations')} />
  </Page>;
}
