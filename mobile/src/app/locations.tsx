import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import * as Location from "expo-location";
import BackButton from "../components/back-button";

import { Device, getConnectedDevices } from "../services/connectionService";
import { getDeviceProfile } from "../services/deviceStorage";
import { connectSocket } from "../services/socketService";

type Coordinates = { latitude: number; longitude: number };
type MapMarker = Coordinates & { id: string; name: string; status: string };

const MAP_HTML = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
html,body,#map{height:100%;width:100%;margin:0;padding:0;background:#e8edf3}
.device-pin-wrap{background:transparent;border:0}
.device-pin{width:18px;height:18px;border-radius:50%;background:#16a34a;border:3px solid white;box-shadow:0 2px 6px #0006}
.device-pin.self{background:#2563eb}
.device-label{border:0!important;border-radius:5px!important;padding:2px 5px!important;color:#111827!important;background:#ffffffed!important;font:600 11px sans-serif!important;box-shadow:0 1px 4px #0003!important}
.device-label:before{display:none!important}
.leaflet-bottom.leaflet-right{bottom:90px}
.leaflet-control-attribution{font-size:10px!important;background:#ffffffd9!important}
</style></head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" onerror="window.ReactNativeWebView&&window.ReactNativeWebView.postMessage('leaflet-error')"></script>
<script>
const map=L.map('map',{zoomControl:true,attributionControl:false}).setView([20,0],2);
const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,tileSize:256,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'}).addTo(map);
L.control.attribution({prefix:false,position:'bottomright'}).addTo(map);
const markers={};
function safeLabel(text){const node=document.createElement('span');node.textContent=text;return node;}
window.updateLocations=function(items,fit){
  const active=new Set();const bounds=L.latLngBounds([]);
  items.forEach(function(item){
    if(!Number.isFinite(item.latitude)||!Number.isFinite(item.longitude))return;
    const id=String(item.id);active.add(id);const point=[item.latitude,item.longitude];bounds.extend(point);
    let marker=markers[id];
    const popup=safeLabel(item.name+' · '+item.status);
    if(marker){marker.setLatLng(point);marker.setPopupContent(popup);marker.setTooltipContent(safeLabel(item.name));}
    else{
      const icon=L.divIcon({className:'device-pin-wrap',html:'<div class="device-pin'+(id==='this-device'?' self':'')+'"></div>',iconSize:[24,24],iconAnchor:[12,12]});
      marker=L.marker(point,{icon:icon}).addTo(map).bindPopup(popup).bindTooltip(safeLabel(item.name),{permanent:true,direction:'bottom',className:'device-label',offset:[0,9]});
      markers[id]=marker;
    }
  });
  Object.keys(markers).forEach(function(id){if(!active.has(id)){map.removeLayer(markers[id]);delete markers[id];}});
  if(fit&&bounds.isValid()){
    if(items.length===1)map.setView(bounds.getCenter(),14);
    else map.fitBounds(bounds.pad(0.18),{maxZoom:16});
  }
};
tiles.on('tileerror',function(){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage('tile-error');});
window.ReactNativeWebView&&window.ReactNativeWebView.postMessage('ready');
</script></body></html>`;

export default function LocationsScreen() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [myLocation, setMyLocation] = useState<Coordinates | null>(null);
  const [myDeviceName, setMyDeviceName] = useState("This device");
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [tileError, setTileError] = useState(false);
  const webViewRef = useRef<WebView>(null);
  const fittedMarkerCount = useRef(0);

  const load = useCallback(async () => {
    try {
      const profile = await getDeviceProfile();
      setMyDeviceName(profile.deviceName || "This device");
      const socket = connectSocket(profile.deviceId);
      const connected = await getConnectedDevices(profile.deviceId);
      setDevices(connected);

      const handleLocation = (update: {
        deviceId: string;
        latitude: number;
        longitude: number;
      }) => {
        setDevices((current) => current.map((device) =>
          device.deviceId === update.deviceId
            ? {
                ...device,
                location: {
                  type: "Point",
                  coordinates: [update.longitude, update.latitude],
                },
                lastSeen: new Date().toISOString(),
              }
            : device
        ));
      };
      socket.on("device-location", handleLocation);
      const handleDisconnected = () => {
        getConnectedDevices(profile.deviceId)
          .then(setDevices)
          .catch((error) => console.warn("Unable to refresh disconnected devices:", error));
      };
      socket.on("connection-disconnected", handleDisconnected);

      let locationSubscription: Location.LocationSubscription | null = null;
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status === Location.PermissionStatus.GRANTED) {
          const current = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setMyLocation({
            latitude: current.coords.latitude,
            longitude: current.coords.longitude,
          });
          locationSubscription = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 5 },
            (location) => setMyLocation({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            })
          );
        }
      } catch (locationError) {
        console.warn("Unable to show this device's map position:", locationError);
      }

      return () => {
        socket.off("device-location", handleLocation);
        socket.off("connection-disconnected", handleDisconnected);
        locationSubscription?.remove();
      };
    } catch (error) {
      Alert.alert(
        "Shared map unavailable",
        error instanceof Error ? error.message : "Could not load paired locations."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let active = true;
    Promise.resolve().then(load).then((removeListener) => {
      if (active) cleanup = removeListener;
      else removeListener?.();
    });
    return () => {
      active = false;
      cleanup?.();
    };
  }, [load]);

  const mappableDevices = devices.filter((device) => device.location?.coordinates?.length === 2);
  const markers = useMemo<MapMarker[]>(() => [
    ...(myLocation ? [{ ...myLocation, id: "this-device", name: myDeviceName, status: "This device" }] : []),
    ...mappableDevices.map((device) => ({
      id: device.deviceId,
      name: device.deviceName || device.deviceId,
      status: device.status === "online" ? "Online · sharing location" : "Offline · last known location",
      latitude: device.location!.coordinates[1],
      longitude: device.location!.coordinates[0],
    })),
  ], [myLocation, myDeviceName, mappableDevices]);
  useEffect(() => {
    if (!mapReady) return;
    const shouldFit = markers.length > fittedMarkerCount.current;
    if (shouldFit) fittedMarkerCount.current = markers.length;
    webViewRef.current?.injectJavaScript(
      `window.updateLocations(${JSON.stringify(markers)},${shouldFit});true;`
    );
  }, [mapReady, markers]);

  const handleMapMessage = (event: WebViewMessageEvent) => {
    if (event.nativeEvent.data === "ready") setMapReady(true);
    if (["tile-error", "leaflet-error"].includes(event.nativeEvent.data)) setTileError(true);
  };

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        style={StyleSheet.absoluteFill}
        source={{ html: MAP_HTML }}
        originWhitelist={["*"]}
        userAgent="WithinLimits/1.0"
        javaScriptEnabled
        domStorageEnabled
        onMessage={handleMapMessage}
        onError={() => setTileError(true)}
      />

      <BackButton style={styles.mapBackButton} />

      <View style={styles.summary}>
        <Text style={styles.title}>Shared locations</Text>
        <Text style={styles.subtitle}>
          Your device and {mappableDevices.length} connected device{mappableDevices.length === 1 ? "" : "s"} shown
        </Text>
      </View>

      {loading && <ActivityIndicator style={styles.loader} size="large" />}
      {tileError && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            Map resources did not load. Check your internet connection and try again.
          </Text>
        </View>
      )}
      {!loading && devices.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Connect to another device using its 8-digit code. Accepted connections appear here.</Text>
        </View>
      )}
      {!loading && devices.length > 0 && mappableDevices.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            Connected devices have not shared a location yet. Keep both apps open and allow location access.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#eef2f6" },
  summary: {
    position: "absolute",
    top: 68,
    left: 16,
    right: 16,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    elevation: 4,
  },
  mapBackButton: {
    position: "absolute",
    top: 12,
    left: 12,
    zIndex: 2,
    backgroundColor: "#ffffff",
    borderRadius: 9,
    elevation: 4,
    marginBottom: 0,
  },
  title: { fontSize: 18, fontWeight: "700", color: "#111827" },
  subtitle: { marginTop: 4, color: "#667085" },
  loader: { position: "absolute", top: 110, alignSelf: "center" },
  empty: {
    position: "absolute",
    bottom: 20,
    left: 16,
    right: 16,
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#ffffff",
  },
  emptyText: { textAlign: "center", color: "#475467", lineHeight: 21 },
});
