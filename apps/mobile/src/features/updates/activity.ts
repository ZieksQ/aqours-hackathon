import type { Message, Report } from "../../shared/api";

export type Activity = {
  id: string;
  report: Report;
  kind: "reply" | "progress" | "submitted" | "resolved";
  title: string;
  body: string;
  createdAt: string;
  tag: string;
  initiallyRead?: boolean;
};
const issueLabels = {
  NoWater: "No water",
  LowPressure: "Low water pressure",
  DirtyWater: "Dirty water",
};
// Only use timestamped events exposed by the Customer API. Current status alone
// cannot tell us when a claim/resolution happened or who performed it.
export function reportActivity(
  report: Report,
  messages: Message[],
): Activity[] {
  return [
    ...messages
      .filter((message) => message.senderRole !== "Customer")
      .map((message) => ({
        id: `message:${report.id}:${message.id}`,
        report,
        kind: "reply" as const,
        title: `${message.senderName} replied to your report`,
        body: `“${message.body}”`,
        createdAt: message.createdAt,
        tag: `${report.id} · ${issueLabels[report.issueType]}`,
      })),
    {
      id: `submitted:${report.id}`,
      report,
      kind: "submitted",
      title: "Report submitted",
      body: `Received report for ${issueLabels[report.issueType]} at ${report.address.details}.`,
      createdAt: report.createdAt,
      tag: report.id,
      initiallyRead: true,
    },
  ];
}
export function activityDay(value: string, now = new Date()): string {
  const date = new Date(value);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  return date.toDateString() === now.toDateString()
    ? "Today"
    : date.toDateString() === yesterday.toDateString()
      ? "Yesterday"
      : date.toLocaleDateString("en-PH", {
          month: "long",
          day: "numeric",
          year: "numeric",
        });
}
export function unreadActivity(
  items: Activity[],
  readIds: ReadonlySet<string>,
) {
  return items.filter((item) => !item.initiallyRead && !readIds.has(item.id));
}
