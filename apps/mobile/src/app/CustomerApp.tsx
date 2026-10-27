import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Alert,
  BackHandler,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { HomeScreen } from "../features/home/HomeScreen";
import { reportDate } from "../features/home/ReportCard";
import { reportKeys } from "../features/reports/api";
import { emptyDraft } from "../features/reports/form";
import { ReportDetailScreen } from "../features/reports/ReportDetailScreen";
import { ReportScreen } from "../features/reports/ReportScreen";
import { ReportsScreen } from "../features/reports/ReportsScreen";
import { reportStyles as s } from "../features/reports/styles";
import type { Account, ApiClient, Report } from "../shared/api";
import { colors, fonts } from "../shared/theme";
import { Brand, Button, Icon, Text } from "../shared/ui";

type Screen = "Home" | "Report" | "Reports";
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
  const [draft, setDraft] = useState(emptyDraft);
  const [receipt, setReceipt] = useState<Report | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
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
  function viewReport(report: Report) {
    if (!preview)
      queryClient.setQueryData(
        reportKeys.detail(account.id, report.id),
        report,
      );
    setReportId(report.id);
  }
  function accountInfo() {
    Alert.alert(
      `${account.firstName} ${account.lastName}`,
      `${account.email}\nCustomer account${preview ? " · Design preview" : ""}`,
      [
        { text: "Close", style: "cancel" },
        {
          text: preview ? "Exit preview" : "Sign out",
          style: "destructive",
          onPress: onSignOut,
        },
      ],
    );
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
      <View style={styles.header}>
        <Brand />
        <Pressable
          disabled={submitting}
          accessibilityState={{ disabled: submitting }}
          accessibilityRole="button"
          accessibilityLabel={`Account for ${account.firstName} ${account.lastName}`}
          onPress={accountInfo}
          style={({ pressed }) => [styles.avatar, pressed && s.pressed]}
        >
          <Text style={styles.initials}>
            {`${account.firstName[0] ?? ""}${account.lastName[0] ?? ""}`.toUpperCase()}
          </Text>
        </Pressable>
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
              accessibilityLabel={label}
              accessibilityState={{ selected, disabled: submitting }}
              onPress={() => {
                if (label === "Profile") accountInfo();
                else if (label === "Updates")
                  Alert.alert(
                    "Updates",
                    "Open My reports to read supplier responses and follow report progress. An updates inbox is coming later.",
                    [
                      { text: "Close", style: "cancel" },
                      {
                        text: "My reports",
                        onPress: () => setScreen("Reports"),
                      },
                    ],
                  );
                else if (label === "Report") openReport();
                else setScreen(label);
              }}
              style={({ pressed }) => [
                styles.tab,
                selected && styles.activeTab,
                pressed && s.pressed,
              ]}
            >
              <Icon
                name={icon}
                color={selected ? colors.primary : colors.muted}
              />
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
        presentationStyle="pageSheet"
        onRequestClose={() => setReportId(null)}
      >
        <SafeAreaView style={s.page}>
          {reportId && (
            <ReportDetailScreen
              key={reportId}
              api={api}
              accountId={account.id}
              reportId={reportId}
              preview={preview}
              draft={replies[reportId] ?? ""}
              onDraftChange={(reply) =>
                setReplies((current) => ({ ...current, [reportId]: reply }))
              }
              backLabel={
                screen === "Reports"
                  ? "Back to My reports"
                  : screen === "Home"
                    ? "Back to Home"
                    : "Back to confirmation"
              }
              onBack={() => setReportId(null)}
            />
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  header: {
    minHeight: 68,
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#D5EDF3",
    alignItems: "center",
    justifyContent: "center",
  },
  initials: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 14 },
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
  activeTab: { borderTopColor: colors.primary },
  tabLabel: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.muted,
    fontFamily: fonts.medium,
  },
  activeLabel: { color: colors.primary, fontFamily: fonts.semibold },
});
