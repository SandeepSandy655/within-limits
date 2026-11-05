import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useAuth } from '@/providers/AuthProvider';
import { Button, ErrorNotice, Field, Page, ui } from '@/components/ui';
import { CAN_CONFIGURE_BACKEND, SERVER_URL, saveServerAddress } from '@/services/serverConfig';
import { checkBackendAddress } from '@/services/backendProbe';
import { getFirebaseAuth } from '@/services/firebaseAuth';

export default function ServerSettingsScreen() {
  const auth = useAuth();
  const [address, setAddress] = useState(SERVER_URL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  async function connect() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      let expectedProjectId = Constants.expoConfig?.extra?.firebaseProjectId as string | undefined;
      try { expectedProjectId = getFirebaseAuth().app.options.projectId || expectedProjectId; } catch { /* First setup uses the project bundled with this app. */ }
      const next = await checkBackendAddress(address, expectedProjectId);
      const unchanged = next === SERVER_URL;
      await saveServerAddress(next);
      if (unchanged) auth.retry();
      router.replace('/sign-in');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not connect to this backend.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <SafeAreaView style={ui.page}><Page>
    <Text style={ui.title}>Connection settings</Text>
    {CAN_CONFIGURE_BACKEND ? <>
      <Text style={ui.subtitle}>Connect this Wi-Fi test app to the backend running on your laptop.</Text>
      <View style={ui.card}><Text style={ui.heading}>Your laptop’s address</Text>
        <Text style={ui.body}>Keep the phone and laptop on the same Wi-Fi or hotspot. Enter the address printed by the backend setup script, including port 5000.</Text>
        <Field label="BACKEND ADDRESS" placeholder="http://192.168.1.20:5000" value={address} onChangeText={setAddress}
          autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!busy} onSubmitEditing={() => void connect()} returnKeyType="go" />
        <ErrorNotice message={error} />
        <Button title="Check & connect" busy={busy} disabled={!address.trim()} icon="wifi" onPress={() => void connect()} />
      </View>
      <View style={ui.notice}><Text style={ui.body}>If your laptop’s IP changes, update this field. You do not need to rebuild or reinstall the APK.</Text>
        <Text style={ui.small}>Keep your laptop awake and its backend running. This address is saved on this device. Use this test build only on a Wi-Fi network you trust.</Text></View>
    </> : <View style={ui.card}><Text style={ui.body}>This release connects to its hosted backend automatically.</Text><Text selectable style={ui.small}>{SERVER_URL}</Text></View>}
    <Button title="Back" secondary disabled={busy} onPress={() => router.canGoBack() ? router.back() : router.replace('/sign-in')} />
  </Page></SafeAreaView>;
}
