import { useEffect, useRef, useState } from 'react';
import { MAP_HTML, type GroupMapProps } from './mapHtml';
export default function GroupMap({ markers, fitVersion, onError }: GroupMapProps) {
  const ref = useRef<HTMLIFrameElement>(null); const [ready, setReady] = useState(false); const fitted = useRef(-1);
  useEffect(() => {
    const listener = (event: MessageEvent) => { if (event.source !== ref.current?.contentWindow || event.data?.source !== 'within-limits-map') return; if (event.data.type === 'ready') setReady(true); if (event.data.type === 'error') onError(); };
    window.addEventListener('message', listener); return () => window.removeEventListener('message', listener);
  }, [onError]);
  useEffect(() => {
    if (!ready) return;
    const fit = fitted.current !== fitVersion; fitted.current = fitVersion;
    ref.current?.contentWindow?.postMessage({ type: 'locations', items: markers, fit }, '*');
  }, [markers, fitVersion, ready]);
  return <iframe ref={ref} title="Shared group locations" srcDoc={MAP_HTML} sandbox="allow-scripts allow-popups" style={{ flex: 1, width: '100%', height: '100%', border: 0 }} />;
}
