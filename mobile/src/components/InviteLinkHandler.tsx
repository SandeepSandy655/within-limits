import { useEffect, useRef } from 'react';
import { useURL } from 'expo-linking';
import { router } from 'expo-router';
import { useDevice } from '../providers/DeviceProvider';
import { parsePairingCode } from '../services/pairing';
export function InviteLinkHandler() {
  const url = useURL(); const { profile } = useDevice(); const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!url || !profile || handled.current === url) return;
    const code = parsePairingCode(url);
    if (code) { handled.current = url; router.push({ pathname: '/connect', params: { code } }); }
  }, [url, profile]);
  return null;
}
