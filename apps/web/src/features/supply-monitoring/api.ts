import { api } from "../accounts/api";
import type { SupplySite } from "../supply-sites/api";

export type SupplyStatus = "Normal" | "Low" | "Unavailable";
export type SupplyReading = {
  id: string;
  siteId: string;
  status: SupplyStatus;
  updatedBy: { id: string; name: string };
  updatedAt: string;
};
export type MonitoredSite = SupplySite & { latestSupply: SupplyReading | null };
export type Page<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
};
const endpoint = "/staff/supply-sites";
export const listMonitoredSites = (page: number, pageSize: number) =>
  api<Page<MonitoredSite>>(`${endpoint}?page=${page}&pageSize=${pageSize}`);
export const readMonitoredSite = (id: string) =>
  api<MonitoredSite>(`${endpoint}/${encodeURIComponent(id)}`);
export const listSupplyReadings = (
  id: string,
  page: number,
  pageSize: number,
) =>
  api<Page<SupplyReading>>(
    `${endpoint}/${encodeURIComponent(id)}/supply-updates?page=${page}&pageSize=${pageSize}`,
  );
export const recordSupplyReading = (id: string, status: SupplyStatus) =>
  api<SupplyReading>(`${endpoint}/${encodeURIComponent(id)}/supply-updates`, {
    status,
  });
export const readingTime = (value: string) =>
  `${new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Manila", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })} PHT`;
