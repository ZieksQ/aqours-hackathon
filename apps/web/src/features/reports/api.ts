import { api } from "../accounts/api";
export type Person = { id: string; name: string; email: string };
export type Ticket = {
  id: string;
  title: string;
  description: string;
  status: "Submitted" | "InProgress" | "Resolved";
  priority: "Low" | "Normal" | "High";
  customer: Person;
  assignedStaff: Person | null;
  createdAt: string;
  claimedAt: string | null;
  resolvedAt: string | null;
  supplierName: string;
  latitude: number;
  longitude: number;
  address: {
    details: string;
    barangayName: string;
    subMunicipalityName: string | null;
    cityMunicipalityName: string;
    provinceName: string | null;
    regionName: string;
  };
};
export type Queue = {
  items: Ticket[];
  page: number;
  pageSize: number;
  totalCount: number;
  summary: { unassigned: number; inProgress: number; highPriority: number };
};
export type Message = {
  id: string;
  reportId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  body: string;
  createdAt: string;
};
export type History = { items: Message[]; nextBefore: number | null };
export const statusName = (status: Ticket["status"]) =>
  ({ Submitted: "Submitted", InProgress: "In progress", Resolved: "Resolved" })[
    status
  ];
export const addressText = (ticket: Ticket) =>
  [
    ticket.address.details,
    ticket.address.barangayName,
    ticket.address.subMunicipalityName,
    ticket.address.cityMunicipalityName,
    ticket.address.provinceName,
    ticket.address.regionName,
  ]
    .filter(Boolean)
    .join(", ");
export const timestamp = (value: string) =>
  new Date(value).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
export const fetchQueue = (query: string) => {
  const params = new URLSearchParams(query);
  if (!params.has("tab")) params.set("tab", "all");
  if (!params.has("pageSize")) params.set("pageSize", "6");
  return api<Queue>(`/staff/reports?${params}`);
};

export async function fetchReportAnalytics() {
  const first = await fetchQueue("tab=all&pageSize=100");
  const pages = await Promise.all(
    Array.from(
      { length: Math.max(0, Math.ceil(first.totalCount / 100) - 1) },
      (_, index) => fetchQueue(`tab=all&pageSize=100&page=${index + 2}`),
    ),
  );
  return [first, ...pages].flatMap((page) => page.items);
}

export const fetchOverview = () => fetchQueue("tab=all&pageSize=1");

export function reportReference(id: string) {
  return id.length > 20 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}
