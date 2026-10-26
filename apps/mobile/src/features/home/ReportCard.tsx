import { StyleSheet, View } from "react-native";
import type { Message, Report } from "../../shared/api";
import { colors, fonts } from "../../shared/theme";
import { Button, Icon, Text } from "../../shared/ui";

export const issueLabels = {
  NoWater: "No water",
  LowPressure: "Low water pressure",
  DirtyWater: "Dirty water",
};
export const statusLabels = {
  Submitted: "Submitted",
  InProgress: "In progress",
  Resolved: "Resolved",
};
export function reportDate(value: string) {
  return new Date(value).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ReportCard({
  report,
  message,
  messageStatus,
  onRetry,
  onView,
}: {
  report: Report;
  message?: Message;
  messageStatus: "pending" | "error" | "success";
  onRetry: () => void;
  onView: () => void;
}) {
  const current = ["Submitted", "InProgress", "Resolved"].indexOf(
    report.status,
  );
  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <Text style={styles.caption}>Your latest report</Text>
        <Text style={styles.badge}>{statusLabels[report.status]}</Text>
      </View>
      <View style={styles.metadata}>
        <Text accessibilityRole="header" style={styles.title}>
          {issueLabels[report.issueType]}
        </Text>
        <Text style={styles.secondary}>
          Submitted {reportDate(report.createdAt)} · Brgy.{" "}
          {report.address.barangayName}
        </Text>
      </View>
      <View
        style={styles.progress}
        accessible
        accessibilityLabel={`Report progress: ${statusLabels[report.status]}`}
      >
        <View style={styles.track} />
        <View
          style={[
            styles.track,
            styles.activeTrack,
            { width: `${current * 33.33}%` },
          ]}
        />
        {Object.entries(statusLabels).map(([status, label], index) => (
          <View key={status} style={styles.step}>
            <View
              style={[styles.circle, index <= current && styles.activeCircle]}
            >
              {index < current ? (
                <Icon name="check" size={14} color={colors.white} />
              ) : (
                <View
                  style={[styles.dot, index === current && styles.activeDot]}
                />
              )}
            </View>
            <Text
              style={[styles.stepText, index <= current && styles.activeText]}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.response}>
        {message ? (
          <>
            <View style={styles.responseHeading}>
              <Icon name="headphones" size={16} />
              <Text style={styles.sender}>
                {message.senderName} (Supplier team) ·{" "}
                {reportDate(message.createdAt)}
              </Text>
            </View>
            <Text>“{message.body}”</Text>
          </>
        ) : (
          <Text style={styles.secondary}>
            {messageStatus === "pending"
              ? "Loading your supplier’s response…"
              : messageStatus === "error"
                ? "Could not load the supplier response."
                : "Your supplier’s response will appear here."}
          </Text>
        )}
        {message && messageStatus === "error" && (
          <Text style={styles.secondary}>
            Could not refresh. Showing the last loaded response.
          </Text>
        )}
        {messageStatus === "error" && (
          <Button label="Retry response" secondary onPress={onRetry} />
        )}
      </View>
      <Button
        label="View report"
        secondary
        icon="arrow-right"
        onPress={onView}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 18,
  },
  heading: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  caption: { color: colors.muted, fontSize: 13, fontFamily: fonts.medium },
  badge: {
    backgroundColor: colors.pale,
    color: colors.primaryPressed,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fonts.semibold,
  },
  metadata: { gap: 4 },
  title: { fontSize: 20, lineHeight: 26, fontFamily: fonts.semibold },
  secondary: { fontSize: 13, lineHeight: 20, color: colors.muted },
  progress: { flexDirection: "row", paddingVertical: 8 },
  track: {
    position: "absolute",
    top: 20,
    left: "16.67%",
    right: "16.67%",
    height: 2,
    backgroundColor: colors.border,
  },
  activeTrack: { right: undefined, backgroundColor: colors.primary },
  step: { width: "33.333%", alignItems: "center", gap: 6 },
  circle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.ground,
    alignItems: "center",
    justifyContent: "center",
  },
  activeCircle: { backgroundColor: colors.primary, borderColor: colors.white },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.muted },
  activeDot: { backgroundColor: colors.white },
  stepText: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.muted,
    textAlign: "center",
  },
  activeText: { color: colors.primary, fontFamily: fonts.semibold },
  response: {
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    backgroundColor: colors.subtle,
    padding: 12,
    gap: 8,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  responseHeading: { flexDirection: "row", alignItems: "center", gap: 6 },
  sender: {
    flex: 1,
    color: colors.primaryPressed,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: fonts.medium,
  },
});
