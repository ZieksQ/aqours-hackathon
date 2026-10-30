import { previewReport, previewResolvedReport } from "../home/preview";
import type { Activity } from "./activity";

export const previewActivity: Activity[] = [
  {
    id: "preview-reply",
    report: previewReport,
    kind: "reply",
    title: "Alex replied to your report",
    body: "“Our team is checking the pressure in your area.”",
    createdAt: "2026-10-27T09:10:00+08:00",
    tag: "AQ-1042 · Low water pressure",
  },
  {
    id: "preview-progress",
    report: previewReport,
    kind: "progress",
    title: "Your report is in progress",
    body: "Staff assigned: Alex Reyes (Quezon City Field Team).",
    createdAt: "2026-10-27T08:45:00+08:00",
    tag: "AQ-1042",
  },
  {
    id: "preview-submitted",
    report: previewReport,
    kind: "submitted",
    title: "Report submitted",
    body: "Received report for Low water pressure at 12 Sampaguita St.",
    createdAt: previewReport.createdAt,
    tag: "AQ-1042",
    initiallyRead: true,
  },
  {
    id: "preview-resolved",
    report: previewResolvedReport,
    kind: "resolved",
    title: "Your water supply report was resolved",
    body: "Repair on main distribution line completed in Brgy. Commonwealth.",
    createdAt: "2026-10-26T15:30:00+08:00",
    tag: "AQ-1031 · Resolved",
    initiallyRead: true,
  },
];
