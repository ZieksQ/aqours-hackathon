import { api } from "../accounts/api";
import type { Page, SupplyStatus } from "../supply-monitoring/api";
export type WeatherDay = {
  date: string;
  maximumTemperatureCelsius: number | null;
  warningState: "Unknown" | "NoWarning" | "PotentialSupplyRisk";
};
export type WeatherSite = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  heatThresholdCelsius: number;
  latestSupplyStatus: SupplyStatus | null;
  latestSupplyAt: string | null;
  supplyMissing: boolean;
  supplyStale: boolean;
  forecastRetrievedAt: string | null;
  forecastRetryAfter: string | null;
  forecastMissing: boolean;
  forecastIncomplete: boolean;
  forecastStale: boolean;
  isProvisional: boolean;
  provider: { name: string; attribution: string; url: string };
  days: WeatherDay[];
  limitations: string[];
  recommendedActions: { code: string; instruction: string; reason: string }[];
};
export type WeatherSettings = {
  heatThresholdCelsius: number;
  updatedAt: string | null;
};
export const readSettings = () =>
  api<WeatherSettings>("/staff/weather/settings");
export const saveSettings = (heatThresholdCelsius: number) =>
  api<WeatherSettings>(
    "/admin/weather/settings",
    { heatThresholdCelsius },
    "PUT",
  );
export const readWeather = (id: string) =>
  api<WeatherSite>(`/staff/supply-sites/${encodeURIComponent(id)}/weather`);
// The overview aggregates all pages so its counts, map and filters have one scope.
export async function listWeather(signal?: AbortSignal) {
  const first = await api<Page<WeatherSite>>(
    "/staff/weather/sites?page=1&pageSize=100",
    undefined,
    undefined,
    signal,
  );
  const items = [...first.items];
  for (let page = 2; (page - 1) * 100 < first.totalCount; page++) {
    const next = await api<Page<WeatherSite>>(
      `/staff/weather/sites?page=${page}&pageSize=100`,
      undefined,
      undefined,
      signal,
    );
    items.push(...next.items);
  }
  return items;
}
export const risk = (site: WeatherSite) =>
  site.days.some((day) => day.warningState === "PotentialSupplyRisk");
export const limited = (site: WeatherSite) =>
  site.isProvisional ||
  site.supplyMissing ||
  site.supplyStale ||
  site.forecastMissing ||
  site.forecastIncomplete ||
  site.forecastStale;
export const condition = (site: WeatherSite) =>
  site.latestSupplyStatus === "Unavailable"
    ? "Unavailable supply"
    : risk(site)
      ? `Potential supply risk${limited(site) ? " · Provisional" : ""}`
      : limited(site)
        ? "Data limited / Unknown"
        : "No combined warning";
export const temperature = (value: number | null) =>
  value === null ? "—" : `${value.toFixed(1)}°C`;
export const dayLabel = (value: string) =>
  new Date(`${value}T12:00:00+08:00`).toLocaleDateString("en-GB", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
  });
