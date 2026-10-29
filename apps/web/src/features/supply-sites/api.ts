import { api, ApiError } from "../accounts/api";

export type SiteAddress = {
  regionCode: string;
  regionName: string;
  provinceCode: string | null;
  provinceName: string | null;
  cityMunicipalityCode: string;
  cityMunicipalityName: string;
  subMunicipalityCode: string | null;
  subMunicipalityName: string | null;
  barangayCode: string;
  barangayName: string;
  details: string;
};
export type SupplySite = {
  id: string;
  name: string;
  address: SiteAddress;
  latitude: number;
  longitude: number;
  createdAt: string;
  updatedAt: string;
};
export type SiteInput = Pick<SupplySite, "name" | "latitude" | "longitude"> & {
  address: Pick<
    SiteAddress,
    | "regionCode"
    | "provinceCode"
    | "cityMunicipalityCode"
    | "subMunicipalityCode"
    | "barangayCode"
    | "details"
  >;
};
export type SitePage = {
  items: SupplySite[];
  page: number;
  pageSize: number;
  totalCount: number;
};
const endpoint = "/admin/supply-sites";
export const listSites = (page: number, pageSize: number) =>
  api<SitePage>(`${endpoint}?page=${page}&pageSize=${pageSize}`);
export const readSite = (id: string) =>
  api<SupplySite>(`${endpoint}/${encodeURIComponent(id)}`);
export const saveSite = (input: SiteInput, id?: string) =>
  api<SupplySite>(
    id ? `${endpoint}/${encodeURIComponent(id)}` : endpoint,
    input,
    id ? "PUT" : "POST",
  );
export const siteAddress = (address: SiteAddress) =>
  [
    address.details,
    /^barangay\b/i.test(address.barangayName)
      ? address.barangayName
      : `Barangay ${address.barangayName}`,
    address.subMunicipalityName,
    address.cityMunicipalityName,
    address.provinceName,
    address.regionName,
  ]
    .filter(Boolean)
    .join(", ");
export const siteTime = (value: string) =>
  `${new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Manila", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })} PHT`;
export const siteError = (error: Error) =>
  error instanceof ApiError && error.status === 404
    ? "This supply site is unavailable. Return to the directory to choose another site."
    : error instanceof ApiError &&
        error.status === 400 &&
        !Object.keys(error.errors).length
      ? "We could not secure your request. Your changes are still here. Please try saving again, or sign in again if the problem continues."
      : error.message;
