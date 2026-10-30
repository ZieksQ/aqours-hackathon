import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activityDay,
  reportActivity,
  unreadActivity,
} from "../src/features/updates/activity.ts";

const report = {
  id: "owned-report",
  issueType: "LowPressure",
  address: { details: "12 Sampaguita St." },
  createdAt: "2026-10-27T08:15:00+08:00",
  status: "Resolved",
};
const messages = [
  {
    id: "staff-reply",
    senderRole: "Staff",
    senderName: "Alex Reyes",
    body: "Checking the pressure.",
    createdAt: "2026-10-27T09:10:00+08:00",
  },
  {
    id: "my-reply",
    senderRole: "Customer",
    senderName: "Mia Santos",
    body: "Thank you.",
    createdAt: "2026-10-27T09:18:00+08:00",
  },
];

test("activity includes supplier replies and submission without inventing claim/resolution events", () => {
  const activity = reportActivity(report, messages);
  assert.equal(activity.length, 2);
  assert.deepEqual(
    activity.map((item) => item.kind),
    ["reply", "submitted"],
  );
  assert.equal(activity[0].title, "Alex Reyes replied to your report");
  assert.equal(activity[0].report.id, report.id);
  assert.equal(activity[0].createdAt, messages[0].createdAt);
  assert.equal(activity[1].initiallyRead, true);
});
test("read IDs mark only selected events and new replies remain unread", () => {
  const activity = reportActivity(report, messages);
  assert.equal(unreadActivity(activity, new Set()).length, 1);
  const read = new Set([activity[0].id]);
  assert.equal(unreadActivity(activity, read).length, 0);
  const next = reportActivity(report, [
    ...messages,
    { ...messages[0], id: "new-reply" },
  ]);
  assert.deepEqual(
    unreadActivity(next, read).map((item) => item.id),
    ["message:owned-report:new-reply"],
  );
  const anotherReport = reportActivity(
    { ...report, id: "other-owned-report" },
    messages,
  );
  assert.equal(unreadActivity(anotherReport, read).length, 1);
});
test("date groups respect local calendar boundaries across months", () => {
  const now = new Date(2026, 10, 1, 12);
  assert.equal(
    activityDay(new Date(2026, 10, 1, 1).toISOString(), now),
    "Today",
  );
  assert.equal(
    activityDay(new Date(2026, 9, 31, 23).toISOString(), now),
    "Yesterday",
  );
  assert.notEqual(
    activityDay(new Date(2026, 9, 30, 12).toISOString(), now),
    "Yesterday",
  );
});
