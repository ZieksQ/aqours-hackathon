import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Field,
  PageHeader,
  SectionPanel,
  StatePanel,
} from "@aqours/ui";
import { FiMaximize, FiRefreshCw } from "react-icons/fi";
import {
  loadReports,
  loadSites,
  locationName,
  type Location,
  type Priority,
  type StatusFilter,
} from "./api";
import { MapCanvas } from "./MapCanvas";
import { LocationDetails, LocationSymbol, MapLegend } from "./MapLocations";
import "./supplier-map.css";

const refreshedAt = (time: number) =>
  new Date(time).toLocaleTimeString("en-PH", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }) + " PHT";

const compactQuery = "(max-width: 640px)";
function subscribeCompact(onChange: () => void) {
  const media = window.matchMedia(compactQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function SupplierMap() {
  const compact = useSyncExternalStore(
    subscribeCompact,
    () => window.matchMedia(compactQuery).matches,
  );
  const [showSites, setShowSites] = useState(true);
  const [showReports, setShowReports] = useState(true);
  const [status, setStatus] = useState<StatusFilter>("unresolved");
  const [priority, setPriority] = useState<Priority | "all">("all");
  const [selection, setSelection] = useState({ key: "", request: 0 });
  const [fitRequest, setFitRequest] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const sites = useQuery({
    queryKey: ["supplier-map", "sites"],
    queryFn: ({ signal }) => loadSites(signal),
    staleTime: 0,
    refetchOnWindowFocus: "always",
  });
  const reports = useQuery({
    queryKey: ["supplier-map", "reports", status],
    queryFn: ({ signal }) => loadReports(status, signal),
    staleTime: 0,
    refetchOnWindowFocus: "always",
  });
  const locations = useMemo<Location[]>(
    () => [
      ...(showSites
        ? (sites.data ?? []).map((value) => ({
            key: `site-${value.id}`,
            kind: "site" as const,
            value,
          }))
        : []),
      ...(showReports
        ? (reports.data ?? [])
            .filter(
              (value) => priority === "all" || value.priority === priority,
            )
            .map((value) => ({
              key: `report-${value.id}`,
              kind: "report" as const,
              value,
            }))
        : []),
    ],
    [showSites, showReports, sites.data, reports.data, priority],
  );
  const visibleSites = locations.filter(
    (location) => location.kind === "site",
  ).length;
  const visibleReports = locations.length - visibleSites;
  const loading =
    (showSites && sites.isPending) || (showReports && reports.isPending);
  const failed =
    (showSites && sites.isError) || (showReports && reports.isError);
  const refreshing = sites.isFetching || reports.isFetching;
  const configured = !!import.meta.env.VITE_GEOAPIFY_API_KEY?.trim();
  const selected = locations.some((location) => location.key === selection.key)
    ? selection.key
    : null;
  const select = (key: string, fromMarker = false) => {
    setSelection((current) => ({ key, request: current.request + 1 }));
    if (fromMarker) {
      const row = Array.from(list.current?.children ?? []).find(
        (element) => element.getAttribute("data-location") === key,
      );
      if (
        row instanceof HTMLElement &&
        list.current &&
        list.current.scrollHeight > list.current.clientHeight
      ) {
        list.current.scrollTo({ top: row.offsetTop, behavior: "instant" });
      }
    }
  };
  return (
    <section className="supplier-map-page">
      <PageHeader
        title="Map"
        description="Supply sites and customer report locations."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                void sites.refetch();
                void reports.refetch();
              }}
              disabled={refreshing}
            >
              <FiRefreshCw aria-hidden="true" />
              {refreshing ? "Refreshing…" : "Refresh"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setFitRequest((current) => current + 1)}
              disabled={!configured || !locations.length}
            >
              <FiMaximize aria-hidden="true" />
              Fit locations
            </Button>
          </>
        }
      />
      <div className="supplier-map-toolbar">
        <fieldset className="supplier-map-layers">
          <legend className="sr-only">Layers</legend>
          <label>
            <input
              type="checkbox"
              checked={showSites}
              onChange={(event) => setShowSites(event.target.checked)}
            />
            Supply sites
          </label>
          <label>
            <input
              type="checkbox"
              checked={showReports}
              onChange={(event) => setShowReports(event.target.checked)}
            />
            Reports
          </label>
        </fieldset>
        <details className="supplier-map-filters" open={!compact}>
          <summary>Filters</summary>
          <div className="supplier-map-filter-fields">
            <Field id="map-status" label="Report status">
              <select
                id="map-status"
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as StatusFilter)
                }
                disabled={!showReports}
              >
                <option value="unresolved">Unresolved reports</option>
                <option value="all">All reports</option>
                <option value="Submitted">Submitted</option>
                <option value="InProgress">In progress</option>
                <option value="Resolved">Resolved</option>
              </select>
            </Field>
            <Field id="map-priority" label="Priority">
              <select
                id="map-priority"
                value={priority}
                onChange={(event) =>
                  setPriority(event.target.value as Priority | "all")
                }
                disabled={!showReports}
              >
                <option value="all">All priorities</option>
                <option value="Low">Low</option>
                <option value="Normal">Normal</option>
                <option value="High">High</option>
              </select>
            </Field>
          </div>
        </details>
      </div>
      <div className="supplier-map-load-state" aria-live="polite">
        {showSites && (
          <LayerState
            name="sites"
            pending={sites.isPending}
            fetching={sites.isFetching}
            error={sites.error}
            updatedAt={sites.dataUpdatedAt}
            count={sites.data?.length}
            retry={() => void sites.refetch()}
          />
        )}
        {showReports && (
          <LayerState
            name="reports"
            pending={reports.isPending}
            fetching={reports.isFetching}
            error={reports.error}
            updatedAt={reports.dataUpdatedAt}
            count={reports.data?.length}
            retry={() => void reports.refetch()}
          />
        )}
      </div>
      <div className="supplier-map-workspace">
        <div className="supplier-map-area">
          {configured ? (
            <MapCanvas
              locations={locations}
              selected={selected}
              selectionRequest={selection.request}
              onSelect={(key) => select(key, true)}
              ready={!loading && (locations.length > 0 || !failed)}
              fitRequest={fitRequest}
            />
          ) : (
            <div className="supplier-map-unconfigured">
              <Alert>
                Map service is not configured. Ask your administrator to
                configure it, then reload. Use the location list to review sites
                and reports.
              </Alert>
            </div>
          )}
        </div>
        <SectionPanel
          title="Locations"
          className="supplier-map-location-panel"
          note={`${visibleSites} sites · ${visibleReports} reports`}
        >
          <p className="supplier-map-list-hint muted">
            Select a location to show its pin. Overlapping pins have separate
            entries.
          </p>
          {!locations.length ? (
            <StatePanel
              title={
                loading
                  ? "Loading locations…"
                  : failed
                    ? "Locations unavailable"
                    : !showSites && !showReports
                      ? "Both layers are hidden"
                      : "No matching locations"
              }
              role="status"
            >
              {loading
                ? "Loading every page before displaying each layer."
                : failed
                  ? "Retry the failed layer to load its locations."
                  : !showSites && !showReports
                    ? "Enable Supply sites or Reports above."
                    : "There are no locations for the selected layers and filters."}
            </StatePanel>
          ) : (
            <ul className="supplier-map-locations" ref={list}>
              {locations.map((location) => (
                <li
                  key={location.key}
                  data-location={location.key}
                  className={selected === location.key ? "is-selected" : ""}
                >
                  <div className="supplier-map-location-heading">
                    <LocationSymbol
                      {...(location.kind === "report"
                        ? {
                            issue: location.value.issueType,
                            priority: location.value.priority,
                            submitted: location.value.status === "Submitted",
                          }
                        : {})}
                    />
                    <Button
                      variant="ghost"
                      aria-label={`Show ${locationName(location)} on map`}
                      aria-pressed={selected === location.key}
                      onClick={() => select(location.key)}
                    >
                      {locationName(location)}
                    </Button>
                  </div>
                  <LocationDetails location={location} />
                </li>
              ))}
            </ul>
          )}
        </SectionPanel>
        <MapLegend compact={compact} />
      </div>
      <p className="supplier-map-note muted">
        Supply readings are manual observations. Refresh for the latest
        locations and report states.
      </p>
    </section>
  );
}

function LayerState({
  name,
  pending,
  fetching,
  error,
  updatedAt,
  count,
  retry,
}: {
  name: string;
  pending: boolean;
  fetching: boolean;
  error: Error | null;
  updatedAt: number;
  count?: number;
  retry: () => void;
}) {
  if (pending) return <p>Loading {name}…</p>;
  if (error)
    return (
      <Alert tone="error">
        Could not load all {name}. {error.message}{" "}
        {count !== undefined
          ? `Showing the last complete layer from ${refreshedAt(updatedAt)}.`
          : "This layer is incomplete and is not displayed."}{" "}
        <Button variant="secondary" onClick={retry} disabled={fetching}>
          Retry {name}
        </Button>
      </Alert>
    );
  return (
    <p>
      {count === 0 ? `No ${name} found.` : `${count} ${name} loaded.`}{" "}
      {fetching ? "Refreshing…" : `Updated ${refreshedAt(updatedAt)}.`}
    </p>
  );
}
