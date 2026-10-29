import { Link } from "react-router";
import {
  FiAlertCircle,
  FiDroplet,
  FiFilter,
  FiHome,
  FiTrendingDown,
} from "react-icons/fi";
import { siteAddress, siteTime } from "../supply-sites/api";
import { readingTime } from "../supply-monitoring/api";
import { statusName, type Issue, type Location, type Priority } from "./api";

const issueIcons = {
  NoWater: FiDroplet,
  LowPressure: FiTrendingDown,
  DirtyWater: FiFilter,
};
export function LocationSymbol({
  issue,
  priority,
  submitted = false,
}: {
  issue?: Issue;
  priority?: Priority;
  submitted?: boolean;
}) {
  const Icon = issue ? issueIcons[issue] : FiHome;
  return (
    <span
      className={`map-symbol ${issue ? `map-priority-${priority ?? "Normal"}` : "map-site-symbol"}`}
      aria-hidden="true"
    >
      <Icon />
      {submitted && (
        <span className="map-submitted">
          <FiAlertCircle />
        </span>
      )}
    </span>
  );
}

export function LocationDetails({ location }: { location: Location }) {
  const item = location.value;
  return (
    <div className="map-location-details">
      {location.kind === "report" ? (
        <>
          <p>
            {location.value.priority} priority ·{" "}
            {statusName(location.value.status)}
          </p>
          <p>Handler: {location.value.handlerName ?? "Unassigned"}</p>
          <p className="muted">
            Submitted {siteTime(location.value.createdAt)}
          </p>
        </>
      ) : (
        <p>
          Manual supply:{" "}
          {location.value.latestSupplyStatus &&
          location.value.latestSupplyAt ? (
            <>
              {location.value.latestSupplyStatus} ·{" "}
              {readingTime(location.value.latestSupplyAt)}
            </>
          ) : (
            "No reading"
          )}
        </p>
      )}
      <p className="muted">{siteAddress(item.address)}</p>
      <Link
        to={
          location.kind === "report"
            ? `/reports/${item.id}`
            : `/supply-monitoring/${item.id}`
        }
      >
        {location.kind === "report" ? "Open ticket" : "View supply history"}
      </Link>
    </div>
  );
}

export function MapLegend({ compact = false }: { compact?: boolean }) {
  return (
    <details className="supplier-map-legend" open={!compact}>
      <summary>Map legend</summary>
      <ul>
        <li>
          <LocationSymbol />
          <span>Supply site (blue)</span>
        </li>
        <li>
          <LocationSymbol issue="NoWater" priority="Low" />
          <span>No water</span>
        </li>
        <li>
          <LocationSymbol issue="LowPressure" priority="Low" />
          <span>Low pressure</span>
        </li>
        <li>
          <LocationSymbol issue="DirtyWater" priority="Low" />
          <span>Dirty water</span>
        </li>
        <li>
          <span className="map-priority-dot map-priority-Low" />
          <span>Low priority (gray)</span>
        </li>
        <li>
          <span className="map-priority-dot map-priority-Normal" />
          <span>Normal priority (amber)</span>
        </li>
        <li>
          <span className="map-priority-dot map-priority-High" />
          <span>High priority (red)</span>
        </li>
        <li>
          <FiAlertCircle className="map-badge-key" aria-hidden="true" />
          <span>Blue ! badge: Submitted / unclaimed</span>
        </li>
      </ul>
    </details>
  );
}
