import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export default function CheckpointMap({ route, group, selectedCheckpoint, onSelect, onPlace, onMove, editing = false, fitKey = 0 }) {
  const container = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef(null);
  const callbacks = useRef({ onPlace, onSelect, onMove });
  const fitRef = useRef("");
  const [sizeRevision, setSizeRevision] = useState(0);
  const schematic = route?.mapMode === "schematic";
  callbacks.current = { onPlace, onSelect, onMove };

  useEffect(() => {
    const map = L.map(container.current, { scrollWheelZoom: false, attributionControl: false, crs: schematic ? L.CRS.Simple : L.CRS.EPSG3857 }).setView(schematic ? [35, 35] : [20.5937, 78.9629], schematic ? 2 : 5);
    if (!schematic) {
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
      L.control.attribution({ prefix: false }).addTo(map);
    }
    mapRef.current = map;
    layersRef.current = L.layerGroup().addTo(map);
    map.on("click", (event) => callbacks.current.onPlace?.([Math.max(-90, Math.min(90, event.latlng.lat)), event.latlng.wrap().lng]));
    const observer = new ResizeObserver(([entry]) => {
      if (!entry.contentRect.width || !entry.contentRect.height) return;
      map.invalidateSize({ pan: false });
      // Refit when a pane becomes visible or the viewport changes size.
      fitRef.current = "";
      setSizeRevision((value) => value + 1);
    });
    observer.observe(container.current);
    return () => { observer.disconnect(); map.remove(); mapRef.current = null; fitRef.current = ""; };
  }, [schematic]);

  useEffect(() => {
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!map || !layers) return;
    layers.clearLayers();
    const checkpoints = route?.checkpoints || [];
    if (route?.path?.length > 1) {
      L.polyline(route.path, { color: "#fff", weight: 8, opacity: 0.9 }).addTo(layers);
      L.polyline(route.path, { color: "#367461", weight: 4, opacity: 0.85, dashArray: editing ? "8 7" : undefined }).addTo(layers);
    }
    if (editing) (route?.path || []).forEach((point) => L.circleMarker(point, { radius: 3, color: "#fff", weight: 1, fillColor: "#367461", fillOpacity: 1, interactive: false }).addTo(layers));
    checkpoints.forEach((cp, index) => {
      const visit = group?.visits.find((item) => item.checkpointId === cp.id);
      const complete = group && visit?.seen === group.members.length;
      const recent = group?.checkpointId === cp.id;
      const icon = L.divIcon({ className: "checkpoint-icon", html: `<span class="map-pin ${complete ? "visited" : ""} ${selectedCheckpoint === cp.id ? "selected" : ""}">${index + 1}</span>${recent ? '<i class="sighting-dot"></i>' : ""}`, iconSize: [32, 32], iconAnchor: [16, 16] });
      const label = document.createElement("span");
      label.textContent = cp.name;
      const marker = L.marker([cp.latitude, cp.longitude], { icon, draggable: editing, title: cp.name, keyboard: true }).bindTooltip(label, { direction: "top", offset: [0, -15], permanent: schematic }).addTo(layers);
      marker.on("click", () => callbacks.current.onSelect?.(cp.id));
      marker.on("dragend", () => { const point = marker.getLatLng().wrap(); callbacks.current.onMove?.(cp.id, [point.lat, point.lng]); });
    });
    const key = `${route?.id || "new"}:${fitKey}`;
    if (fitRef.current !== key && checkpoints.length && map.getSize().x > 0 && map.getSize().y > 0) {
      map.fitBounds(L.latLngBounds([...checkpoints.map((cp) => [cp.latitude, cp.longitude]), ...(route.path || [])]).pad(schematic ? 0.45 : 0.18), { maxZoom: schematic ? 3 : 17, animate: false });
      fitRef.current = key;
    }
  }, [route, group, selectedCheckpoint, editing, fitKey, sizeRevision, schematic]);

  useEffect(() => {
    const cp = route?.checkpoints.find((item) => item.id === selectedCheckpoint);
    if (cp && !editing) mapRef.current?.panTo([cp.latitude, cp.longitude]);
  }, [selectedCheckpoint, editing, route?.id]);

  return <div ref={container} className={`checkpoint-map ${editing ? "editable-map" : ""} ${schematic ? "schematic-map" : ""}`} aria-label={editing ? "Route editor map. Click to place points." : "Checkpoint route map"} />;
}
