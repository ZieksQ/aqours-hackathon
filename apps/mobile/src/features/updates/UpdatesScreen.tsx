import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import type { Report } from "../../shared/api";
import { accountScreenStyles as s } from "../../shared/accountScreenStyles";
import { colors, fonts } from "../../shared/theme";
import { Button, Icon, Notice, Text } from "../../shared/ui";
import { issueLabels, statusLabels } from "../home/ReportCard";
import { activityDay, unreadActivity, type Activity } from "./activity";
import type { useUpdates } from "./useUpdates";

export function UpdatesScreen({
  updates,
  preview,
  readIds,
  readSaveError,
  onRead,
  onView,
  onReports,
}: {
  updates: ReturnType<typeof useUpdates>;
  preview: boolean;
  readIds: ReadonlySet<string>;
  readSaveError: boolean;
  onRead: (ids: string[]) => void;
  onView: (report: Report, conversation?: boolean) => void;
  onReports: () => void;
}) {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const unread = unreadActivity(updates.items, readIds);
  const visible = unreadOnly ? unread : updates.items;
  const now = preview ? new Date("2026-10-27T12:00:00+08:00") : new Date();
  const groups = new Map<string, Activity[]>();
  visible.forEach((item) => {
    const day = activityDay(item.createdAt, now);
    groups.set(day, [...(groups.get(day) ?? []), item]);
  });
  const report = updates.latestReport;
  return (
    <ScrollView
      style={s.page}
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl
          refreshing={!preview && updates.isRefetching}
          onRefresh={() => {
            if (!preview) void updates.refetch();
          }}
          tintColor={colors.primary}
        />
      }
    >
      <View>
        <Text accessibilityRole="header" style={s.title}>
          Updates
        </Text>
        <Text style={[s.subtitle, styles.subtitle]}>
          Supplier responses and report activity
        </Text>
        <View style={styles.controls}>
          <View accessibilityRole="tablist" style={styles.segments}>
            {([false, true] as const).map((value) => (
              <Pressable
                key={String(value)}
                accessibilityRole="tab"
                hitSlop={{ top: 4, bottom: 4 }}
                accessibilityState={{ selected: unreadOnly === value }}
                accessibilityLabel={
                  value ? `Unread, ${unread.length}` : "All updates"
                }
                onPress={() => setUnreadOnly(value)}
                style={[
                  styles.segment,
                  unreadOnly === value && styles.selected,
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    unreadOnly === value && styles.selectedText,
                  ]}
                >
                  {value ? "Unread" : "All"}
                </Text>
                {value && <Text style={styles.count}>{unread.length}</Text>}
              </Pressable>
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: unread.length === 0 }}
            disabled={!unread.length}
            onPress={() => onRead(unread.map((item) => item.id))}
            style={({ pressed }) => [styles.markRead, pressed && s.pressed]}
          >
            <Text style={styles.markText}>Mark all read</Text>
          </Pressable>
        </View>
      </View>
      {readSaveError && <Notice>We couldn’t save that read status. Open the update again when you’re back online.</Notice>}
      {!preview && updates.isPending && (
        <ActivityIndicator
          accessibilityLabel="Loading updates"
          color={colors.primary}
        />
      )}
      {!preview && updates.isError && (
        <View style={s.section}>
          <Notice>{updates.error.message}</Notice>
          {updates.data && (
            <Text style={s.small}>Showing the last loaded activity.</Text>
          )}
          <Button
            label="Try again"
            secondary
            onPress={() => {
              void updates.refetch();
            }}
          />
        </View>
      )}
      {Array.from(groups, ([day, items]) => (
        <View key={day} style={styles.group}>
          <View style={styles.groupHeading}>
            <Text accessibilityRole="header" style={styles.day}>
              {day}
            </Text>
            {unreadActivity(items, readIds).length > 0 && (
              <Text style={styles.unreadCaption}>
                {unreadActivity(items, readIds).length} unread
              </Text>
            )}
          </View>
          {items.map((item) => {
            const isUnread = !item.initiallyRead && !readIds.has(item.id);
            const time = new Date(item.createdAt).toLocaleTimeString("en-PH", {
              hour: "numeric",
              minute: "2-digit",
            });
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`${isUnread ? "Unread. " : ""}${item.title}. ${item.body}. Open report ${item.report.id}`}
                onPress={() => {
                  onRead([item.id]);
                  onView(item.report, item.kind === "reply");
                }}
                style={({ pressed }) => [
                  s.card,
                  styles.activity,
                  pressed && s.pressed,
                ]}
              >
                {isUnread && <View style={styles.dot} />}
                <Icon
                  name={
                    item.kind === "submitted"
                      ? "check-circle"
                      : item.kind === "progress"
                        ? "refresh-cw"
                        : "message-square"
                  }
                  size={24}
                  color={
                    item.kind === "submitted" ? colors.muted : colors.primary
                  }
                  style={styles.icon}
                />
                <View
                  style={[styles.activityBody, isUnread && styles.unreadBody]}
                >
                  <Text style={styles.time}>
                    {day === "Yesterday" ? `Yesterday, ${time}` : time}
                  </Text>
                  <Text style={[styles.activityTitle, isUnread && styles.bold]}>
                    {item.title}
                  </Text>
                  <Text style={styles.body}>{item.body}</Text>
                  <View style={styles.tagRow}>
                    <Text
                      style={[
                        styles.tag,
                        item.kind === "submitted" && styles.neutralTag,
                        item.kind === "resolved" && styles.resolvedTag,
                      ]}
                    >
                      {item.tag}
                    </Text>
                    <Icon name="chevron-right" size={18} color="#6F797C" />
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
      {visible.length === 0 && (preview || updates.isSuccess) && (
        <View style={[s.card, styles.empty]}>
          <Text style={styles.activityTitle}>
            {unreadOnly ? "You’re all caught up" : "No updates yet"}
          </Text>
          <Text style={styles.body}>
            {unreadOnly
              ? "You have no unread updates."
              : "Your report activity and supplier responses will appear here."}
          </Text>
        </View>
      )}
      {report && (
        <View style={[s.card, styles.summary]}>
          <View style={styles.summaryHeading}>
            <Text style={styles.summaryCaption}>Your report</Text>
            <Text style={styles.status}>
              {report.status === "InProgress"
                ? "In Progress"
                : statusLabels[report.status]}
            </Text>
          </View>
          <Text style={styles.summaryTitle}>
            {report.id} · {issueLabels[report.issueType]}
          </Text>
          <Text style={styles.time}>Brgy. {report.address.barangayName}</Text>
          <View style={styles.summaryFooter}>
            <Text style={[s.small, styles.handler]}>
              {preview ? "Handled by Alex Reyes" : statusLabels[report.status]}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => onView(report)}
              style={styles.details}
            >
              <Text style={styles.markText}>View details</Text>
              <Icon name="arrow-right" size={18} />
            </Pressable>
          </View>
        </View>
      )}
      {!preview && updates.isSuccess && (
        <View style={s.section}>
          <Text style={s.small}>
            Recent activity from your latest 20 reports and the latest 50
            messages per report. Read status lasts until sign-out.
          </Text>
          <Button label="View all reports" secondary onPress={onReports} />
        </View>
      )}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  subtitle: { fontSize: 15 },
  controls: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
    flexWrap: "wrap",
  },
  segments: {
    flexDirection: "row",
    padding: 4,
    gap: 4,
    backgroundColor: "#E2E8F0",
    borderRadius: 12,
  },
  segment: {
    minHeight: 36,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  selected: { backgroundColor: colors.white },
  filterText: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: fonts.medium,
    color: "#3F484C",
  },
  selectedText: { color: colors.primary, fontFamily: fonts.semibold },
  count: {
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 6,
    borderRadius: 12,
    color: colors.primaryPressed,
    backgroundColor: colors.pale,
    fontFamily: fonts.semibold,
  },
  markRead: { minHeight: 44, paddingHorizontal: 8, justifyContent: "center" },
  markText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.medium,
    color: colors.primary,
  },
  group: { gap: 8 },
  groupHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  day: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.semibold,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: colors.muted,
  },
  unreadCaption: {
    fontSize: 11,
    lineHeight: 16,
    color: "#6F797C",
    fontFamily: fonts.medium,
  },
  activity: { padding: 16, flexDirection: "row", gap: 12 },
  icon: { marginTop: 2 },
  activityBody: { flex: 1, minWidth: 0 },
  unreadBody: { paddingRight: 16 },
  dot: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  time: { fontSize: 13, lineHeight: 18, color: colors.muted },
  activityTitle: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: fonts.medium,
    marginTop: 2,
  },
  bold: { fontFamily: fonts.semibold },
  body: { fontSize: 14, lineHeight: 20, color: colors.muted, marginTop: 4 },
  tagRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  tag: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fonts.medium,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: colors.pale,
    color: colors.primaryPressed,
  },
  neutralTag: { backgroundColor: "#EFEDF0", color: colors.muted },
  resolvedTag: { backgroundColor: "#ECF7F2", color: "#2B8C67" },
  summary: { padding: 16, borderColor: colors.border, marginTop: 8 },
  summaryHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
    gap: 8,
  },
  summaryCaption: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: fonts.semibold,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.muted,
  },
  status: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: fonts.semibold,
    color: colors.primaryPressed,
    backgroundColor: colors.pale,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  summaryTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.medium,
    marginBottom: 2,
  },
  summaryFooter: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  handler: { flex: 1 },
  details: {
    minHeight: 32,
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
  },
  empty: { padding: 16 },
});
