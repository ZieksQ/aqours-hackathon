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
  ({ Submitted: "Open", InProgress: "In Progress", Resolved: "Resolved" })[
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
export const fetchQueue = (query: string) =>
  api<Queue>(`/staff/reports?${query}`);
