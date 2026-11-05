import { useEffect, useRef, useState } from 'react';
import { WebView } from 'react-native-webview';
import { MAP_HTML, type GroupMapProps } from './mapHtml';
export default function GroupMap({ markers, fitVersion, onError }: GroupMapProps) {
  const ref = useRef<WebView<unknown>>(null); const [ready, setReady] = useState(false); const fitted = useRef(-1);
  useEffect(() => {
    if (!ready) return;
    const fit = fitted.current !== fitVersion; fitted.current = fitVersion;
    ref.current?.injectJavaScript(`window.updateLocations(${JSON.stringify(markers)},${fit});true;`);
  }, [markers, fitVersion, ready]);
  return <WebView<unknown> ref={ref} style={{ flex: 1 }} source={{ html: MAP_HTML }} originWhitelist={['about:*']} javaScriptEnabled userAgent="WithinLimits/1.0" onMessage={(event) => { if (event.nativeEvent.data === 'ready') setReady(true); if (event.nativeEvent.data === 'error') onError(); }} onError={onError} onShouldStartLoadWithRequest={(request) => request.url === 'about:blank' || request.url.startsWith('about:blank#')} />;
}
