import type { Account, Message, Report } from "../../shared/api";

// Stitch sample content is available only through the explicit development preview.
export const previewAccount: Account = {
  id: "design-preview",
  email: "mia.santos@example.com", // taste-skill-ignore: original Stitch sample, shown only in a labeled development preview.
  firstName: "Mia",
  lastName: "Santos",
  role: "Customer",
  requiresPasswordChange: false,
};
export const previewReport: Report = {
  id: "AQ-1042",
  issueType: "LowPressure",
  description: "Water pressure has been low since this morning.",
  latitude: 14.6978,
  longitude: 121.0873,
  address: {
    regionCode: "1300000000",
    regionName: "National Capital Region (NCR)",
    provinceCode: null,
    provinceName: null,
    cityMunicipalityCode: "1381300000",
    subMunicipalityCode: null,
    subMunicipalityName: null,
    barangayCode: "1381300022",
    cityMunicipalityName: "Quezon City",
    barangayName: "Commonwealth",
    details: "Sampaguita Street",
  },
  status: "InProgress",
  createdAt: "2026-10-27T08:15:00+08:00",
};
export const previewMessage: Message = {
  id: "preview-response",
  senderName: "Alex Reyes",
  senderRole: "Staff",
  body: "Our team is checking the pressure in your area.",
  createdAt: "2026-10-27T09:10:00+08:00",
};
export const previewClaimedAt = "2026-10-27T08:42:00+08:00";
export const previewCustomerReply: Message = {
  id: "preview-customer-reply",
  senderName: "Mia Santos",
  senderRole: "Customer",
  body: "Thank you. Please let me know when the pressure is back to normal.",
  createdAt: "2026-10-27T09:18:00+08:00",
};
