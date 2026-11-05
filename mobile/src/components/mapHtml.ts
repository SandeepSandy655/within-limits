export const MAP_HTML = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>html,body,#map{height:100%;width:100%;margin:0;background:#E8EDE3}.pin{height:20px;width:20px;border:3px solid white;border-radius:50%;background:#225C45;box-shadow:0 2px 8px #183D3540}.pin.self{background:#3161AB}.pin.stale{background:#92998F}.label{font:600 12px sans-serif;color:#183D35;border:0;border-radius:8px;padding:5px 8px}.leaflet-control-attribution{font-size:10px}</style></head><body><div id="map"></div>
<script>function report(type){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(type);else window.parent.postMessage({source:'within-limits-map',type:type},'*');}</script>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" onerror="report('error')"></script>
<script>
if(typeof L!=='undefined'){
const map=L.map('map',{attributionControl:false}).setView([20,0],2);
const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>'}).addTo(map);
L.control.attribution({prefix:false,position:'bottomright'}).addTo(map);
const markers={};let fitted=false;
function label(value){const el=document.createElement('span');el.textContent=value;return el;}
window.updateLocations=function(items,fit){
const active=new Set(),bounds=L.latLngBounds([]);
items.forEach(function(item){
if(!Number.isFinite(item.latitude)||!Number.isFinite(item.longitude)||Math.abs(item.latitude)>90||Math.abs(item.longitude)>180)return;
const id=String(item.id),point=[item.latitude,item.longitude];active.add(id);bounds.extend(point);
const icon=L.divIcon({className:'',html:'<div class="pin'+(item.self?' self':'')+(item.stale?' stale':'')+'"></div>',iconSize:[26,26],iconAnchor:[13,13]});
if(markers[id])markers[id].setLatLng(point).setIcon(icon).setTooltipContent(label(item.name)).setPopupContent(label(item.name+' · '+item.status));
else markers[id]=L.marker(point,{icon:icon}).addTo(map).bindTooltip(label(item.name),{permanent:true,direction:'bottom',className:'label',offset:[0,12]}).bindPopup(label(item.name+' · '+item.status));
});
Object.keys(markers).forEach(function(id){if(!active.has(id)){map.removeLayer(markers[id]);delete markers[id];}});
if((fit||!fitted)&&bounds.isValid()){map.fitBounds(bounds.pad(0.25),{maxZoom:16,padding:[45,60]});fitted=true;}
};
window.addEventListener('message',function(event){if(event.source!==window.parent)return;const data=event.data;if(data&&data.type==='locations'&&Array.isArray(data.items))window.updateLocations(data.items,data.fit);});
tiles.on('tileerror',function(){report('error');});report('ready');
}
</script></body></html>`;
export interface MapMarker { id: string; name: string; latitude: number; longitude: number; status: string; self?: boolean; stale: boolean; }
export interface GroupMapProps { markers: MapMarker[]; fitVersion: number; onError: () => void; }
