import type { Coordinates } from "./form";

export type MapMessage =
  { type: "loading" | "loaded" | "error" } | ({ type: "select" } & Coordinates);

// Treat the WebView as a transport boundary, not as trusted form input.
export function parseMapMessage(data: string): MapMessage | null {
  try {
    const message = JSON.parse(data) as Record<string, unknown> | null;
    if (!message || typeof message !== "object") return null;
    if (
      message.type === "loading" ||
      message.type === "loaded" ||
      message.type === "error"
    )
      return { type: message.type };
    if (
      message.type === "select" &&
      typeof message.latitude === "number" &&
      typeof message.longitude === "number" &&
      Number.isFinite(message.latitude) &&
      Number.isFinite(message.longitude) &&
      Math.abs(message.latitude) <= 90 &&
      Math.abs(message.longitude) <= 180
    )
      return {
        type: "select",
        latitude: message.latitude,
        longitude: message.longitude,
      };
  } catch {
    /* Ignore malformed bridge messages. */
  }
  return null;
}

export const mapDocumentOrigin = "https://aqours.invalid/";
export const mapAttributionLinks = [
  "https://www.geoapify.com/",
  "https://www.openstreetmap.org/copyright",
  "https://openmaptiles.org/",
];

export function createMapHtml({
  apiKey,
  coordinates,
  interactive,
}: {
  apiKey: string;
  coordinates: Coordinates | null;
  interactive: boolean;
}) {
  // Escape embedded JSON so configuration can never terminate the script element.
  const config = JSON.stringify({ apiKey, coordinates, interactive }).replace(
    /</g,
    "\\u003c",
  );
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://unpkg.com; style-src 'unsafe-inline' https://unpkg.com; img-src data: https://maps.geoapify.com https://unpkg.com; connect-src https://maps.geoapify.com; base-uri 'none'; form-action 'none'; frame-src 'none'">
<title>Aqours report location</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="anonymous">
<style>
html,body,#map { width:100%; height:100%; margin:0; background:#F4F7F6; }
.leaflet-container { font-family: sans-serif; }
.leaflet-control-zoom a { min-width:44px; min-height:44px; line-height:44px; color:#145466; }
.leaflet-control-attribution { font-size:11px; line-height:16px; max-width:calc(100vw - 24px); }
.leaflet-control-attribution a { color:#145466; }
.report-pin { background:transparent; border:0; }
.report-pin span { display:block; width:24px; height:24px; border:3px solid white; border-radius:50% 50% 50% 0; background:#1B6C80; transform:rotate(-45deg); }
.report-pin span::after { content:""; position:absolute; width:8px; height:8px; background:white; border-radius:50%; top:8px; left:8px; }
</style>
</head>
<body>
<div id="map" role="application" aria-label="${interactive ? "Choose the water problem location" : "Selected report location"}"></div>
<script>
(function () {
  function post(message) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(message));
  }
  window.addEventListener('error', function () { post({type:'error'}); });
  window.aqoursMapError = function () { post({type:'error'}); };
  window.startAqoursMap = function () {
    try {
      const config = ${config};
      let marker = null;
      let selected = null;
      let usable = false;
      let errors = 0;
      let loaded = 0;
      const map = L.map('map', {
        zoomControl: config.interactive,
        dragging: config.interactive,
        touchZoom: config.interactive,
        scrollWheelZoom: config.interactive,
        doubleClickZoom: config.interactive,
        boxZoom: config.interactive,
        keyboard: config.interactive,
        attributionControl: true
      });
      const point = config.coordinates;
      map.setView(point ? [point.latitude, point.longitude] : [12.5,122], point ? 16 : 5);
      const icon = L.divIcon({ className:'report-pin', html:'<span></span>', iconSize:[30,30], iconAnchor:[15,34] });
      function select(latitude, longitude, notify) {
        if (notify && !usable) {
          if (marker && selected) marker.setLatLng([selected.latitude,selected.longitude]);
          return;
        }
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude)>90 || Math.abs(longitude)>180) return;
        if (marker) marker.setLatLng([latitude,longitude]);
        else {
          marker = L.marker([latitude,longitude], {icon:icon, draggable:config.interactive, autoPan:config.interactive, title:'Report location', alt:'Selected problem location'}).addTo(map);
          marker.on('dragend', function () {
            const position = marker.getLatLng().wrap();
            select(position.lat,position.lng,true);
          });
        }
        selected = {latitude:latitude,longitude:longitude};
        if (notify) post({type:'select',latitude:latitude,longitude:longitude});
      }
      if (point) select(point.latitude,point.longitude,false);
      map.on('click', function (event) {
        if (!config.interactive || !usable) return;
        const position = event.latlng.wrap();
        select(position.lat,position.lng,true);
      });
      const tiles = L.tileLayer('https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=' + encodeURIComponent(config.apiKey), {
        minZoom:2, maxZoom:20,
        attribution:'Powered by <a href="https://www.geoapify.com/">Geoapify</a> | <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a> | <a href="https://openmaptiles.org/">© OpenMapTiles</a>'
      });
      tiles.on('loading', function () { usable=false; errors=0; loaded=0; post({type:'loading'}); });
      tiles.on('tileerror', function () { errors++; usable=false; post({type:'error'}); });
      tiles.on('tileload', function () { loaded++; });
      tiles.on('load', function () { usable=loaded>0 && errors===0; post({type:usable?'loaded':'error'}); });
      tiles.addTo(map);
      window.addEventListener('resize', function () { map.invalidateSize(); });
    } catch (_) { post({type:'error'}); }
  };
})();
</script>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin="anonymous" onload="startAqoursMap()" onerror="aqoursMapError()"></script>
</body>
</html>`;
}
