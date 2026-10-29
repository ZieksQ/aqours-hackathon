import { useEffect, useMemo, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { divIcon, latLngBounds, type Marker as LeafletMarker } from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { Alert, Button } from "@aqours/ui";
import { LocationDetails, LocationSymbol } from "./MapLocations";
import { locationName, type Location } from "./api";

function LocationMarker({
  location,
  selected,
  selectionRequest,
  onSelect,
}: {
  location: Location;
  selected: boolean;
  selectionRequest: number;
  onSelect: (key: string) => void;
}) {
  const ref = useRef<LeafletMarker>(null);
  const map = useMap();
  const report = location.kind === "report" ? location.value : null;
  const icon = useMemo(
    () =>
      divIcon({
        className: "supplier-map-pin",
        html: renderToStaticMarkup(
          <LocationSymbol
            issue={report?.issueType}
            priority={report?.priority}
            submitted={report?.status === "Submitted"}
          />,
        ),
        iconSize: [36, 40],
        iconAnchor: [18, 20],
        popupAnchor: [0, -20],
      }),
    [report?.issueType, report?.priority, report?.status],
  );
  useEffect(() => {
    if (selected && ref.current) {
      map.setView(ref.current.getLatLng(), Math.max(map.getZoom(), 14), {
        animate: false,
      });
      ref.current.openPopup();
    }
  }, [selected, selectionRequest, map]);
  const name = `${locationName(location)}. ${report ? `${report.priority} priority. ${report.status === "InProgress" ? "In progress" : report.status}. Handler: ${report.handlerName ?? "Unassigned"}` : "Supply site"}`;
  useEffect(() => {
    // Leaflet's title option is not mutable through React Leaflet. Keep the
    // accessible name current when a refresh changes the handler or status.
    const element = ref.current?.getElement();
    if (element) {
      element.title = name;
      element.setAttribute("aria-label", name);
    }
  }, [name]);
  return (
    <Marker
      ref={ref}
      position={[location.value.latitude, location.value.longitude]}
      icon={icon}
      title={name}
      alt={name}
      zIndexOffset={selected ? 1000 : 0}
      eventHandlers={{ click: () => onSelect(location.key) }}
    >
      <Popup>
        <strong>{locationName(location)}</strong>
        <LocationDetails location={location} />
      </Popup>
    </Marker>
  );
}

function Viewport({
  locations,
  ready,
  fitRequest,
}: {
  locations: Location[];
  ready: boolean;
  fitRequest: number;
}) {
  const map = useMap();
  const initialized = useRef(false);
  const lastFit = useRef(0);
  useEffect(() => {
    const requested = fitRequest !== lastFit.current;
    if (!requested && (initialized.current || !ready)) return;
    // An empty first load keeps the Philippines view. Later refreshes preserve it.
    initialized.current = true;
    lastFit.current = fitRequest;
    if (locations.length) {
      const bounds = latLngBounds(
        locations.map((location) => [
          location.value.latitude,
          location.value.longitude,
        ]),
      );
      map.fitBounds(bounds, {
        paddingTopLeft: [36, 36],
        paddingBottomRight: [36, 70],
        maxZoom: bounds.getNorthEast().equals(bounds.getSouthWest()) ? 14 : 16,
        animate: false,
      });
    } else if (requested)
      map.setView([12.8797, 121.774], 6, { animate: false });
  }, [map, locations, ready, fitRequest]);
  useEffect(() => {
    const container = map.getContainer();
    container.setAttribute("role", "region");
    container.setAttribute(
      "aria-label",
      "Supply sites and report locations. Use arrow keys to pan, or choose a location from the list.",
    );
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);
  return null;
}

function Tiles() {
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
  return (
    <>
      <TileLayer
        key={attempt}
        url={`https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${encodeURIComponent(import.meta.env.VITE_GEOAPIFY_API_KEY.trim())}`}
        attribution={
          'Powered by <a href="https://www.geoapify.com/">Geoapify</a> | <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a> | <a href="https://openmaptiles.org/">© OpenMapTiles</a>'
        }
        eventHandlers={{
          load: () =>
            setStatus((current) => (current === "error" ? current : "ready")),
          tileerror: () => setStatus("error"),
        }}
      />
      {status !== "ready" && (
        <div className="supplier-map-tile-notice">
          {status === "loading" ? (
            <p role="status">Loading map tiles…</p>
          ) : (
            <Alert tone="error">
              Map tiles could not load. Locations and the list remain available.{" "}
              <Button
                variant="secondary"
                onClick={() => {
                  setStatus("loading");
                  setAttempt((current) => current + 1);
                }}
              >
                Retry map
              </Button>
            </Alert>
          )}
        </div>
      )}
    </>
  );
}

export function MapCanvas({
  locations,
  selected,
  selectionRequest,
  onSelect,
  ready,
  fitRequest,
}: {
  locations: Location[];
  selected: string | null;
  selectionRequest: number;
  onSelect: (key: string) => void;
  ready: boolean;
  fitRequest: number;
}) {
  return (
    <MapContainer
      center={[12.8797, 121.774]}
      zoom={6}
      minZoom={3}
      scrollWheelZoom={false}
      className="supplier-map-canvas"
    >
      <Tiles />
      <Viewport locations={locations} ready={ready} fitRequest={fitRequest} />
      {locations.map((location) => (
        <LocationMarker
          key={location.key}
          location={location}
          selected={selected === location.key}
          selectionRequest={selectionRequest}
          onSelect={onSelect}
        />
      ))}
    </MapContainer>
  );
}
