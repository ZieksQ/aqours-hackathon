import { api } from "../accounts/api";
import type { SiteAddress } from "../supply-sites/api";
import type { SupplyStatus } from "../supply-monitoring/api";

export type ReportStatus = "Submitted" | "InProgress" | "Resolved";
export type StatusFilter = "unresolved" | "all" | ReportStatus;
export type Priority = "Low" | "Normal" | "High";
export type Issue = "NoWater" | "LowPressure" | "DirtyWater";
type MapLocation = {
  id: string;
  address: SiteAddress;
  latitude: number;
  longitude: number;
};
export type MapSite = MapLocation & {
  name: string;
  latestSupplyStatus: SupplyStatus | null;
  latestSupplyAt: string | null;
};
export type MapReport = MapLocation & {
  issueType: Issue;
  priority: Priority;
  status: ReportStatus;
  createdAt: string;
  handlerId: string | null;
  handlerName: string | null;
};
type Page<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
};

// Publish a complete layer atomically. A failed page rejects the entire refresh,
// retaining the last complete query result rather than claiming partial coverage.
async function loadLayer<T>(
  layer: "sites" | "reports",
  signal: AbortSignal,
  status?: StatusFilter,
) {
  const items = new Map<string, T>();
  for (let page = 1; ; page++) {
    const params = new URLSearchParams({ page: String(page), pageSize: "100" });
    if (status) params.set("status", status);
    const result = await api<Page<T & { id: string }>>(
      `/staff/map/${layer}?${params}`,
      undefined,
      undefined,
      signal,
    );
    result.items.forEach((item) => items.set(item.id, item));
    if (page * result.pageSize >= result.totalCount) return [...items.values()];
  }
}
export const loadSites = (signal: AbortSignal) =>
  loadLayer<MapSite>("sites", signal);
export const loadReports = (status: StatusFilter, signal: AbortSignal) =>
  loadLayer<MapReport>("reports", signal, status);
export const issueName = (issue: Issue) =>
  ({
    NoWater: "No water",
    LowPressure: "Low pressure",
    DirtyWater: "Dirty water",
  })[issue];
export const statusName = (status: ReportStatus) =>
  status === "InProgress" ? "In progress" : status;

export type Location = { key: string } & (
  { kind: "site"; value: MapSite } | { kind: "report"; value: MapReport }
);
export const locationName = (location: Location) =>
  location.kind === "site"
    ? location.value.name
    : `${issueName(location.value.issueType)} · ${location.value.id.slice(0, 8)}`;
