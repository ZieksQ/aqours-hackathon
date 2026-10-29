import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  BackHandler,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ProfileScreen } from "../features/accounts/ProfileScreen";
import { UpdatesScreen } from "../features/updates/UpdatesScreen";
import { useUpdates } from "../features/updates/useUpdates";
import { unreadActivity } from "../features/updates/activity";
import { HomeScreen } from "../features/home/HomeScreen";
import { reportDate } from "../features/home/ReportCard";
import { reportKeys } from "../features/reports/api";
import { ReportConversationScreen } from "../features/reports/ReportConversationScreen";
import { conversationStyles } from "../features/reports/conversationStyles";
import { emptyDraft } from "../features/reports/form";
import { ReportDetailScreen } from "../features/reports/ReportDetailScreen";
import { ReportScreen } from "../features/reports/ReportScreen";
import { ReportsScreen } from "../features/reports/ReportsScreen";
import { reportStyles as s } from "../features/reports/styles";
import type { Account, ApiClient, Report } from "../shared/api";
import { colors, fonts } from "../shared/theme";
import { Brand, Button, Icon, Text } from "../shared/ui";

type Screen = "Home" | "Report" | "Reports" | "Updates" | "Profile";
export function CustomerApp({
  api,
  account,
  preview,
  onSignOut,
}: {
  api: ApiClient;
  account: Account;
  preview: boolean;
  onSignOut: () => void;
}) {
  const queryClient = useQueryClient();
  const submitting =
    useIsMutating({ mutationKey: ["submit-report", account.id] }) > 0;
  const [screen, setScreen] = useState<Screen>("Home");
  const updates = useUpdates(api, account.id, preview);
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(() => new Set());
  const unreadCount = unreadActivity(updates.items, readIds).length;
  function markRead(ids: string[]) {
    setReadIds((current) => new Set([...current, ...ids]));
  }
  const [draft, setDraft] = useState(emptyDraft);
  const [receipt, setReceipt] = useState<Report | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [reportPage, setReportPage] = useState<"details" | "conversation">(
    "details",
  );
  const [replies, setReplies] = useState<Record<string, string>>({});
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (submitting) return true;
        if (screen === "Home") return false;
        setScreen("Home");
        return true;
      },
    );
    return () => subscription.remove();
  }, [screen, submitting]);
  function openReport() {
    setReceipt(null);
    setScreen("Report");
  }
  function viewReport(report: Report, conversation = false) {
    setReportPage(conversation ? "conversation" : "details");
    if (!preview)
      queryClient.setQueryData(
        reportKeys.detail(account.id, report.id),
        report,
      );
    setReportId(report.id);
  }
  return (
    <View style={s.page}>
      {preview && (
        <View style={styles.previewBanner}>
          <Text style={s.small}>Design preview · Sample data</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onSignOut}
            style={styles.exit}
          >
            <Text style={styles.exitText}>Exit preview</Text>
          </Pressable>
        </View>
      )}
      <View
        style={[styles.header, screen === "Profile" && styles.profileHeader]}
      >
        <Brand />
        {screen !== "Profile" && (
          <Pressable
            disabled={submitting}
            accessibilityState={{ disabled: submitting }}
            accessibilityRole="button"
            accessibilityLabel={`Account for ${account.firstName} ${account.lastName}`}
            hitSlop={6}
            onPress={() => setScreen("Profile")}
            style={({ pressed }) => [styles.avatar, pressed && s.pressed]}
          >
            <Icon name="user" color="#3F484C" size={20} />
          </Pressable>
        )}
      </View>
      {screen === "Home" ? (
        <HomeScreen
          api={api}
          account={account}
          preview={preview}
          onCreate={openReport}
          onReports={() => setScreen("Reports")}
          onView={viewReport}
        />
      ) : screen === "Updates" ? (
        <UpdatesScreen
          updates={updates}
          preview={preview}
          readIds={readIds}
          onRead={markRead}
          onView={viewReport}
          onReports={() => setScreen("Reports")}
        />
      ) : screen === "Profile" ? (
        <ProfileScreen
          api={api}
          account={account}
          preview={preview}
          onSignOut={onSignOut}
        />
      ) : screen === "Reports" ? (
        <ReportsScreen
          api={api}
          accountId={account.id}
          preview={preview}
          onCreate={openReport}
          onView={viewReport}
          onBack={() => setScreen("Home")}
        />
      ) : receipt ? (
        <ScrollView contentContainerStyle={s.content}>
          <View style={s.card} accessibilityLiveRegion="polite">
            <Icon name="check-circle" size={32} />
            <Text accessibilityRole="header" style={s.title}>
              Report submitted
            </Text>
            <Text>
              Your supplier has received your water issue. Follow its progress
              and responses in My reports.
            </Text>
            <Text style={s.status}>Submitted</Text>
            <Text style={s.small}>{reportDate(receipt.createdAt)}</Text>
            <Text selectable style={s.small}>
              Reference: {receipt.id}
            </Text>
          </View>
          <Button
            label="View report"
            icon="arrow-right"
            onPress={() => viewReport(receipt)}
          />
          <Button
            label="My reports"
            secondary
            onPress={() => setScreen("Reports")}
          />
          <Button
            label="Report another issue"
            secondary
            onPress={() => setReceipt(null)}
          />
        </ScrollView>
      ) : (
        <ReportScreen
          api={api}
          accountId={account.id}
          preview={preview}
          draft={draft}
          setDraft={setDraft}
          onSubmitted={(report) => {
            setDraft(emptyDraft());
            setReceipt(report);
          }}
        />
      )}
      <View accessibilityRole="tablist" style={styles.dock}>
        {(
          [
            ["Home", "home"],
            ["Report", "plus-circle"],
            ["Updates", "bell"],
            ["Profile", "user"],
          ] as const
        ).map(([label, icon]) => {
          const selected =
            label === "Home"
              ? screen === "Home" || screen === "Reports"
              : label === screen;
          return (
            <Pressable
              key={label}
              disabled={submitting}
              accessibilityRole="tab"
              accessibilityLabel={
                label === "Updates" && unreadCount
                  ? `Updates, ${unreadCount} unread`
                  : label
              }
              accessibilityState={{ selected, disabled: submitting }}
              onPress={() => {
                if (label === "Report") openReport();
                else setScreen(label);
              }}
              style={({ pressed }) => [styles.tab, pressed && s.pressed]}
            >
              <View style={styles.tabIcon}>
                {selected && <View style={styles.activeTab} />}
                <Icon
                  name={icon}
                  color={selected ? colors.primary : "#3F484C"}
                />
                {label === "Updates" && unreadCount > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={[styles.tabLabel, selected && styles.activeLabel]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Modal
        visible={reportId !== null}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => {
          if (reportPage === "conversation") setReportPage("details");
          else setReportId(null);
        }}
      >
        <SafeAreaView
          style={
            reportPage === "conversation" ? conversationStyles.safePage : s.page
          }
        >
          {reportId &&
            (reportPage === "conversation" ? (
              <ReportConversationScreen
                key={`${reportId}-conversation`}
                api={api}
                accountId={account.id}
                reportId={reportId}
                preview={preview}
                draft={replies[reportId] ?? ""}
                onDraftChange={(reply) =>
                  setReplies((current) => ({ ...current, [reportId]: reply }))
                }
                onBack={() => setReportPage("details")}
                onViewDetails={() => setReportPage("details")}
              />
            ) : (
              <ReportDetailScreen
                key={`${reportId}-details`}
                api={api}
                accountId={account.id}
                reportId={reportId}
                preview={preview}
                backLabel={
                  screen === "Reports"
                    ? "Back to My reports"
                    : screen === "Home"
                      ? "Back to Home"
                      : screen === "Updates"
                        ? "Back to Updates"
                        : "Back to confirmation"
                }
                onBack={() => setReportId(null)}
                onOpenConversation={() => setReportPage("conversation")}
              />
            ))}
        </SafeAreaView>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  header: {
    minHeight: 64,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#EFEDF0",
    alignItems: "center",
    justifyContent: "center",
  },
  profileHeader: { minHeight: 56 },
  unreadBadge: {
    position: "absolute",
    top: -5,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadBadgeText: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: fonts.bold,
    color: colors.white,
  },
  previewBanner: {
    paddingLeft: 24,
    paddingRight: 12,
    backgroundColor: colors.pale,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
  },
  exit: { minHeight: 44, paddingHorizontal: 12, justifyContent: "center" },
  exitText: {
    color: colors.primaryPressed,
    fontFamily: fonts.semibold,
    fontSize: 13,
  },
  dock: {
    flexDirection: "row",
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  tab: {
    flex: 1,
    minHeight: 64,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderTopWidth: 2,
    borderTopColor: "transparent",
    paddingVertical: 8,
  },
  activeTab: {
    position: "absolute",
    top: -8,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: colors.primary,
  },
  tabIcon: { width: 44, alignItems: "center" },
  tabLabel: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.muted,
    fontFamily: fonts.medium,
  },
  activeLabel: { color: colors.primary, fontFamily: fonts.semibold },
});
