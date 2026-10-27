import { useEffect, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { divIcon, type LeafletEvent } from "leaflet";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { FiMapPin } from "react-icons/fi";
import { Alert, Button } from "@aqours/ui";

export type MapPoint = { latitude: number; longitude: number };
const pin = divIcon({
  className: "site-map-pin",
  html: renderToStaticMarkup(<FiMapPin aria-hidden="true" />),
  iconSize: [32, 40],
  iconAnchor: [16, 37],
});
function MapInteraction({
  value,
  onChange,
}: {
  value: MapPoint | null;
  onChange?: (value: MapPoint) => void;
}) {
  const map = useMapEvents({
    click: (event) =>
      onChange?.({
        latitude: event.latlng.lat,
        longitude: event.latlng.wrap().lng,
      }),
  });
  return (
    <>
      {value && (
        <Marker
          position={[value.latitude, value.longitude]}
          icon={pin}
          draggable={!!onChange}
          title={
            onChange
              ? "Site location pin. Drag to adjust."
              : "Recorded site location"
          }
          alt="Site location"
          eventHandlers={{
            dragend: (event: LeafletEvent) => {
              const point = event.target.getLatLng().wrap();
              onChange?.({ latitude: point.lat, longitude: point.lng });
            },
          }}
        />
      )}
      {onChange && (
        <div className="site-map-center-action">
          <Button
            variant="secondary"
            onClick={() => {
              const point = map.getCenter().wrap();
              onChange({ latitude: point.lat, longitude: point.lng });
            }}
          >
            Place pin at map center
          </Button>
        </div>
      )}
    </>
  );
}
function ResizeMap() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}
export function SiteMap({
  value,
  onChange,
  error,
  label,
}: {
  value: MapPoint | null;
  onChange?: (value: MapPoint | null) => void;
  error?: string;
  label?: string;
}) {
  const apiKey = import.meta.env.VITE_GEOAPIFY_API_KEY?.trim();
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  useEffect(() => {
    const timer = window.setTimeout(
      () => setStatus((current) => (current === "loading" ? "error" : current)),
      15000,
    );
    return () => window.clearTimeout(timer);
  }, [attempt]);
  const retry = () => {
    setStatus("loading");
    setAttempt((current) => current + 1);
  };
  return (
    <div
      className="site-location"
      id="site-location"
      tabIndex={-1}
      aria-describedby={error ? "site-location-error" : undefined}
    >
      {onChange && (
        <>
          <p>
            Select the site's location on the map. Drag the pin to adjust it.
          </p>
          <p className="site-helper">
            The address and map location are selected separately.
          </p>
        </>
      )}
      <div className="site-pin-status" role="status">
        <FiMapPin aria-hidden="true" />
        <span>
          {value ? (
            <>
              <strong>Pin placed</strong>
              {label && <> · {label}</>}
            </>
          ) : (
            "No location selected. Choose a point on the map."
          )}
        </span>
        {onChange && value && (
          <Button variant="ghost" onClick={() => onChange(null)}>
            Reset pin
          </Button>
        )}
      </div>
      {!apiKey ? (
        <Alert>
          Map unavailable. Ask your administrator to configure the map service,
          then reload this page.
        </Alert>
      ) : (
        <>
          <div className={`site-map-frame${error ? " site-map-invalid" : ""}`}>
            <MapContainer
              key={attempt}
              center={
                value ? [value.latitude, value.longitude] : [12.8797, 121.774]
              }
              zoom={value ? 15 : 6}
              minZoom={3}
              scrollWheelZoom={false}
              className="site-map"
              attributionControl
              aria-label={
                onChange
                  ? "Select site location. Use arrow keys to pan, then Place pin at map center."
                  : "Recorded site location map"
              }
            >
              <TileLayer
                url={`https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${encodeURIComponent(apiKey)}`}
                attribution={
                  'Powered by <a href="https://www.geoapify.com/">Geoapify</a> | <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a> | <a href="https://openmaptiles.org/">© OpenMapTiles</a>'
                }
                eventHandlers={{
                  load: () =>
                    setStatus((current) =>
                      current === "error" ? current : "ready",
                    ),
                  tileerror: () => setStatus("error"),
                }}
              />
              <MapInteraction value={value} onChange={onChange} />
              <ResizeMap />
            </MapContainer>
          </div>
          {status === "loading" && (
            <p className="site-helper" role="status">
              Loading map…
            </p>
          )}
          {status === "error" && (
            <Alert tone="error">
              Map tiles could not load. Your selected pin is retained.{" "}
              <Button variant="secondary" onClick={retry}>
                Retry map
              </Button>
            </Alert>
          )}
          {onChange && (
            <p className="site-helper">
              You can also use the map's arrow keys to move, then choose “Place
              pin at map center”.
            </p>
          )}
        </>
      )}
      {error && (
        <p id="site-location-error" className="ui-field-error">
          {error}
        </p>
      )}
    </div>
  );
}
