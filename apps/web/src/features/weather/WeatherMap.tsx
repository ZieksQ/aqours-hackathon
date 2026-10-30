import { useEffect, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import { latLngBounds } from "leaflet";
import { Alert, Button } from "@aqours/ui";
import { condition, limited, risk, type WeatherSite } from "./api";
function Fit({ sites }: { sites: WeatherSite[] }) {
  const map = useMap();
  useEffect(() => {
    if (sites.length)
      map.fitBounds(latLngBounds(sites.map((s) => [s.latitude, s.longitude])), {
        padding: [35, 35],
        maxZoom: 14,
      });
  }, [sites, map]);
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}
export function WeatherMap({
  sites,
  onSelect,
}: {
  sites: WeatherSite[];
  onSelect: (id: string) => void;
}) {
  const key = import.meta.env.VITE_GEOAPIFY_API_KEY?.trim();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  return (
    <>
      <div className="weather-legend">
        <span>● Potential supply risk</span>
        <span>● Unavailable supply</span>
        <span>● No combined warning</span>
        <span>● Data limited / Unknown</span>
      </div>
      <div className="weather-map">
        <MapContainer
          center={[12.8797, 121.774]}
          zoom={6}
          scrollWheelZoom={false}
          aria-label="Weather assessment site map"
        >
          <Fit sites={sites} />
          {key && (
            <TileLayer
              key={attempt}
              url={`https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${encodeURIComponent(key)}`}
              attribution='Powered by <a href="https://www.geoapify.com/">Geoapify</a> | <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>'
              eventHandlers={{ tileerror: () => setFailed(true) }}
            />
          )}
          {sites.map((site) => (
            <CircleMarker
              key={site.id}
              center={[site.latitude, site.longitude]}
              radius={9}
              pathOptions={{
                color: "#fff",
                weight: 3,
                fillOpacity: 1,
                fillColor:
                  site.latestSupplyStatus === "Unavailable"
                    ? "#b42332"
                    : risk(site)
                      ? "#a36b00"
                      : limited(site)
                        ? "#747b7d"
                        : "#26704f",
              }}
              eventHandlers={{ click: () => onSelect(site.id) }}
            >
              <Popup>
                <strong>{site.name}</strong>
                <p>{condition(site)}</p>
                <Button variant="secondary" onClick={() => onSelect(site.id)}>
                  Show forecast
                </Button>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
      {(!key || failed) && (
        <Alert>
          Map tiles unavailable. Choose a site in the assessment list below.
          {key && (
            <Button
              variant="ghost"
              onClick={() => {
                setFailed(false);
                setAttempt(attempt + 1);
              }}
            >
              Retry map
            </Button>
          )}
        </Alert>
      )}
    </>
  );
}
