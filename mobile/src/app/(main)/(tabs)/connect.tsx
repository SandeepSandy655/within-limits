import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SectionSwitch, pairSections } from '@/components/AppNavigation';
import { AppIcon } from '@/components/AppIcon';
import { Button, ErrorNotice, Field, Page, colors, ui } from '@/components/ui';
import { useDevice } from '@/providers/DeviceProvider';
import { cancelConnection, previewHost, sendConnectionRequestByCode, type Connection, type HostPreview } from '@/services/connectionService';
import { parsePairingCode } from '@/services/pairing';

export default function ConnectScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const initialCode = typeof params.code === 'string' ? parsePairingCode(params.code) || '' : '';
  return <ConnectFlow key={initialCode} initialCode={initialCode} />;
}
function ConnectFlow({ initialCode }: { initialCode: string }) {
  const device = useDevice();
  const [code, setCode] = useState(initialCode); const [host, setHost] = useState<HostPreview | null>(null);
  const [request, setRequest] = useState<Connection | null>(null); const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const locked = useRef(false);
  const [scanner, setScanner] = useState(false); const scanned = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  useFocusEffect(useCallback(() => () => setScanner(false), []));
  const linked = device.connections.find((c) => c.requesterId === device.profile?.deviceId && ['accepted', 'pending'].includes(c.status));
  const current = device.connections.find((c) => c._id === request?._id) || linked || request;
  const expired = current?.status === 'pending' && !!current.expiresAt && Date.parse(current.expiresAt) <= now;
  const hosting = device.connections.some((c) => c.receiverId === device.profile?.deviceId && ['accepted', 'pending'].includes(c.status));
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  async function run(action: () => Promise<void>) { if (locked.current) return; locked.current = true; setBusy(true); setError(''); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); } finally { locked.current = false; setBusy(false); } }
  function findHost(value = code) { void run(async () => { if (!device.profile) throw new Error('Your device is still connecting. Return home and retry setup.'); const parsed = parsePairingCode(value); if (!parsed) throw new Error('Enter an 8-digit code or scan a Within Limits invitation.'); setCode(parsed); setHost(await previewHost(device.profile.deviceId, parsed)); }); }
  async function openScanner() { await run(async () => { const grant = permission?.granted ? permission : await requestPermission(); if (!grant.granted) throw new Error('Allow camera access in Settings, or enter the host’s code below.'); scanned.current = false; setScanner(true); }); }
  return <Page><SectionSwitch selected="join" items={pairSections} /><View style={{ gap: 5 }}><Text style={ui.title}>{current?.status === 'accepted' ? 'You’re connected.' : 'Find your people.'}</Text><Text style={ui.subtitle}>Scan an invitation or enter your host’s 8-digit code.</Text></View><ErrorNotice message={error || device.error} />
    {current ? <View style={ui.card}>
      <View style={[ui.avatar, { backgroundColor: colors.mint }]}><AppIcon name={current.status === 'accepted' ? 'check' : 'bell'} color={colors.green} /></View><Text style={ui.heading}>{expired ? 'This request has expired' : current.status === 'accepted' ? 'Welcome to the group' : current.status === 'pending' ? 'Waiting for your host' : 'This request is closed'}</Text>
      <Text style={ui.body}>{current.receiverName || host?.deviceName || 'Your host'}</Text>
      {current.status === 'accepted' && <Text style={ui.body}>Connection range: {(current.rangeMeters || 1000) / 1000} km from your host</Text>}
      <Text style={ui.subtitle}>{expired ? 'Send a new request when your host is ready.' : current.status === 'accepted' ? 'Turn on location sharing from Home to appear on your host’s map.' : current.status === 'pending' ? 'Your host can approve you in Requests. This screen updates automatically, and you can return Home while you wait.' : 'The request was declined or cancelled. You can try again with the host’s code.'}</Text>
      {current.status === 'pending' && !expired && <><Text style={ui.small}>Request expires in {Math.max(1, Math.ceil((Date.parse(current.expiresAt || '') - now) / 60_000))} minutes.</Text><Button title="Cancel join request" secondary busy={busy} onPress={() => void run(async () => { const result = await cancelConnection(current._id, device.profile!.deviceId); setRequest(result); await device.refresh(); })} /></>}
      {current.status === 'accepted' && <Text style={ui.small}>Your host is alerted if you go out of reach. Only your host can invite more devices.</Text>}
      {current.status === 'accepted' ? <Button title="Go to your group" onPress={() => router.replace('/connections')} /> : (expired || current.status !== 'pending') && <Button title="Try another invitation" onPress={() => { setRequest(null); setHost(null); setCode(''); }} />}
    </View> : hosting ? <View style={ui.card}><Text style={ui.heading}>You’re already hosting</Text><Text style={ui.subtitle}>Remove existing members and close pending requests before joining a different host.</Text><Button title="Manage your group" onPress={() => router.push('/connections')} /></View> : <>
      {scanner ? <View style={ui.card}><CameraView style={{ height: 290, borderRadius: 16 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onMountError={() => { setScanner(false); setError('Camera unavailable. Enter the code instead.'); }} onBarcodeScanned={(result) => { if (scanned.current) return; scanned.current = true; setScanner(false); findHost(result.data); }} /><Text style={ui.small}>Keep the host’s QR code inside the camera view.</Text><Button title="Enter code instead" secondary onPress={() => setScanner(false)} /></View> : <View style={ui.card}>
        <View style={{ alignItems: 'center', backgroundColor: colors.ink, borderRadius: 18, paddingVertical: 30, gap: 12 }}><AppIcon name="scan" size={64} color={colors.lime} /><Text style={{ color: colors.white, fontWeight: '700', fontSize: 16 }}>Point. Scan. Connect.</Text><Text style={{ color: '#B8CED9', fontSize: 12 }}>Ask your host to open their invitation</Text></View><Button title="Open QR scanner" icon="scan" disabled={busy || !device.profile} onPress={() => void openScanner()} />
        {permission && !permission.granted && !permission.canAskAgain && <Button title="Open camera settings" secondary onPress={() => void Linking.openSettings().catch(() => setError('Open your device settings to allow camera access.'))} />}
        <Text style={[ui.small, { textAlign: 'center' }]}>or enter an invitation code</Text>
        <Field label="HOST’S CONNECTION CODE" value={code} onChangeText={(value) => { setCode(parsePairingCode(value) || value.replace(/[^\d\s-]/g, '').slice(0, 12)); setHost(null); }} placeholder="0000 0000" keyboardType="number-pad" autoComplete="off" editable={!busy} onSubmitEditing={() => findHost()} style={{ textAlign: 'center', fontSize: 28, letterSpacing: 4 }} />
        <Button title="Find host" busy={busy} disabled={!parsePairingCode(code) || !device.profile} onPress={() => findHost()} />
      </View>}
      {host && !scanner && <View style={[ui.card, { borderColor: '#8FCEB9', backgroundColor: '#F0FAF5' }]}><Text style={ui.label}>IS THIS YOUR HOST?</Text><Text style={ui.heading}>{host.deviceName}</Text><Text style={ui.body}>{host.status === 'online' ? 'Online now' : 'Currently offline · they can approve when they return'}</Text><Text style={ui.small}>{host.available} guest space{host.available === 1 ? '' : 's'} available · {host.occupied}/4 joined or reserved</Text><Button title={host.available ? 'Request to join' : 'Group is full'} busy={busy} disabled={!host.available} onPress={() => void run(async () => { const result = await sendConnectionRequestByCode(device.profile!.deviceId, parsePairingCode(code)!); setRequest(result); await device.refresh(); })} /><Text style={ui.small}>Your host will see your device name. Location sharing starts only when you enable it.</Text></View>}
    </>}
  </Page>;
}
