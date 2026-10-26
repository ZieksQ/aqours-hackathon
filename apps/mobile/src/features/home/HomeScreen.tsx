import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Account, ApiClient, Message, Report } from "../../shared/api";
import { colors, fonts } from "../../shared/theme";
import { Brand, Button, Icon, Notice, Text } from "../../shared/ui";
import {
  issueLabels,
  ReportCard,
  reportDate,
  statusLabels,
} from "./ReportCard";
import { previewMessage, previewReport } from "./preview";

function comingSoon(feature: string) {
  Alert.alert(
    feature,
    "This feature is coming soon. Login and Home are available in this version.",
  );
}

export function HomeScreen({
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
  const [detailOpen, setDetailOpen] = useState(false);
  const reports = useQuery({
    queryKey: ["reports", account.id, "latest"],
    enabled: !preview,
    queryFn: ({ signal }) =>
      api.request<{ items: Report[] }>(
        "/reports?page=1&pageSize=1",
        undefined,
        true,
        true,
        signal,
      ),
    staleTime: 30000,
  });
  const report = preview ? previewReport : reports.data?.items[0];
  const messages = useQuery({
    queryKey: ["messages", account.id, report?.id],
    enabled: !preview && !!report,
    queryFn: ({ signal }) =>
      api.request<{ items: Message[] }>(
        `/reports/${report!.id}/messages?pageSize=100`,
        undefined,
        true,
        true,
        signal,
      ),
    staleTime: 30000,
  });
  const message = preview
    ? previewMessage
    : messages.data?.items
        .filter((item) => item.senderRole !== "Customer")
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  const initials =
    `${account.firstName.charAt(0)}${account.lastName.charAt(0)}`.toUpperCase();

  function showAccount() {
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
    <View style={styles.page}>
      {preview && (
        <View style={styles.previewBanner}>
          <Text style={styles.previewLabel}>Design preview · Sample data</Text>
          <Pressable
            onPress={onSignOut}
            accessibilityRole="button"
            style={styles.exit}
          >
            <Text style={styles.exitText}>Exit preview</Text>
          </Pressable>
        </View>
      )}
      <View style={styles.header}>
        <Brand />
        <Pressable
          onPress={showAccount}
          accessibilityRole="button"
          accessibilityLabel={`Account for ${account.firstName} ${account.lastName}`}
          style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
        >
          <Text style={styles.initials}>{initials}</Text>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={!preview && reports.isRefetching}
            onRefresh={() => {
              if (!preview) {
                void reports.refetch();
                if (report) void messages.refetch();
              }
            }}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.greeting}>
          <Text accessibilityRole="header" style={styles.title}>
            Hello, {account.firstName}
          </Text>
          <View style={styles.location}>
            <Icon name="map-pin" size={17} />
            <Text style={styles.muted}>
              {report?.address.cityMunicipalityName ??
                "Your water reporting hub"}
            </Text>
          </View>
        </View>
        <Button
          label="Report a water issue"
          icon="plus-circle"
          onPress={() => comingSoon("Report a water issue")}
        />
        {!preview && reports.isError && (
          <View style={styles.stateCard}>
            <Notice>{reports.error.message}</Notice>
            {reports.data && (
              <Text style={styles.small}>
                Showing your last loaded report. Pull down to refresh.
              </Text>
            )}
            <Button
              label="Try again"
              secondary
              onPress={() => {
                void reports.refetch();
              }}
            />
          </View>
        )}
        {!preview && reports.isPending ? (
          <View style={styles.stateCard} accessibilityLiveRegion="polite">
            <Text style={styles.sectionTitle}>Your latest report</Text>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.muted}>Loading your reports…</Text>
          </View>
        ) : report ? (
          <ReportCard
            report={report}
            message={message}
            messageStatus={preview ? "success" : messages.status}
            onRetry={() => {
              void messages.refetch();
            }}
            onView={() => setDetailOpen(true)}
          />
        ) : (
          !reports.isError && (
            <View style={styles.stateCard}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                Your latest report
              </Text>
              <Text>No reports yet</Text>
              <Text style={styles.muted}>
                Once you report a water issue, you can follow its progress and
                your supplier’s response here.
              </Text>
            </View>
          )
        )}
        <View style={styles.supplySection}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Nearby supply
          </Text>
          {preview ? (
            <View style={styles.supplyCard}>
              <View
                style={styles.map}
                accessible
                accessibilityLabel="Illustrative map with Commonwealth Site and Fairview Station. This is sample data, not a real map."
              >
                <View
                  style={[
                    styles.road,
                    { top: 36, transform: [{ rotate: "-2deg" }] },
                  ]}
                />
                <View
                  style={[
                    styles.road,
                    { top: 108, transform: [{ rotate: "-3deg" }] },
                  ]}
                />
                <View
                  style={[
                    styles.verticalRoad,
                    { left: "35%", transform: [{ rotate: "-8deg" }] },
                  ]}
                />
                <View
                  style={[
                    styles.verticalRoad,
                    { left: "80%", transform: [{ rotate: "9deg" }] },
                  ]}
                />
                <Text style={[styles.mapLabel, { top: 24, left: 16 }]}>
                  Commonwealth Site
                </Text>
                <Text style={[styles.mapLabel, { top: 75, right: 12 }]}>
                  Fairview Station
                </Text>
                <Text style={styles.mapCaption}>
                  Illustrative map · Quezon City
                </Text>
              </View>
              <View style={styles.supplyDetails}>
                <Text style={styles.supplyTitle}>Commonwealth Supply Site</Text>
                <Text style={styles.small}>
                  Low supply · Manually updated Oct 27, 8:30 AM
                </Text>
                <Text style={styles.small}>Sample supply information</Text>
              </View>
            </View>
          ) : (
            <View style={styles.stateCard}>
              <Icon name="map-pin" />
              <Text>Supply information is not available yet.</Text>
              <Text style={styles.small}>
                Supplier sites, maps, and manually recorded supply updates will
                appear here when available.
              </Text>
            </View>
          )}
        </View>
        <Button
          label="My reports · Coming soon"
          secondary
          onPress={() => comingSoon("My reports")}
        />
        {!preview && (
          <Text style={styles.freshness}>
            Pull down to refresh
            {reports.dataUpdatedAt
              ? ` · Last checked ${new Date(reports.dataUpdatedAt).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}`
              : ""}
          </Text>
        )}
      </ScrollView>
      <View style={styles.dock} accessibilityRole="tablist">
        {(
          [
            ["Home", "home"],
            ["Report", "plus-circle"],
            ["Updates", "bell"],
            ["Profile", "user"],
          ] as const
        ).map(([label, icon]) => (
          <Pressable
            key={label}
            accessibilityRole="tab"
            accessibilityLabel={
              label === "Report" || label === "Updates"
                ? `${label}, coming soon`
                : label
            }
            accessibilityState={{ selected: label === "Home" }}
            onPress={() =>
              label === "Profile"
                ? showAccount()
                : label === "Home"
                  ? undefined
                  : comingSoon(label)
            }
            style={({ pressed }) => [
              styles.tab,
              label === "Home" && styles.activeTab,
              pressed && styles.pressed,
            ]}
          >
            <Icon
              name={icon}
              color={label === "Home" ? colors.primary : colors.muted}
            />
            <Text
              style={[
                styles.tabLabel,
                label === "Home" && styles.selectedLabel,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Modal
        visible={detailOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDetailOpen(false)}
      >
        <SafeAreaView style={styles.page}>
          <ScrollView contentContainerStyle={styles.detailContent}>
            <Button
              label="Back to Home"
              secondary
              icon="arrow-left"
              onPress={() => setDetailOpen(false)}
            />
            {report && (
              <>
                <Text accessibilityRole="header" style={styles.title}>
                  {issueLabels[report.issueType]}
                </Text>
                {preview && (
                  <Text style={styles.muted}>
                    Design preview · Sample report
                  </Text>
                )}
                <Text selectable style={styles.small}>
                  Report reference: {report.id}
                </Text>
                <Text style={styles.status}>{statusLabels[report.status]}</Text>
                <Text style={styles.small}>
                  Submitted {reportDate(report.createdAt)}
                </Text>
                <Text style={styles.sectionTitle}>Description</Text>
                <Text selectable>{report.description}</Text>
                <Text style={styles.sectionTitle}>Report location</Text>
                <Text selectable>
                  {[
                    report.address.details,
                    report.address.barangayName,
                    report.address.cityMunicipalityName,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </Text>
                <Text style={styles.sectionTitle}>
                  Latest supplier response
                </Text>
                {message ? (
                  <>
                    <Text style={styles.small}>
                      {message.senderName} · {reportDate(message.createdAt)}
                    </Text>
                    <Text selectable>{message.body}</Text>
                  </>
                ) : (
                  <Text>
                    {messages.isPending
                      ? "Loading supplier response…"
                      : messages.isError
                        ? "Could not load the supplier response. Return Home to retry."
                        : "No supplier response yet."}
                  </Text>
                )}
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.ground },
  previewBanner: {
    paddingLeft: 24,
    paddingRight: 12,
    backgroundColor: colors.pale,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
  },
  previewLabel: { fontSize: 12, color: colors.primaryPressed },
  exit: { minHeight: 44, justifyContent: "center", paddingHorizontal: 12 },
  exitText: {
    color: colors.primaryPressed,
    fontFamily: fonts.semibold,
    fontSize: 13,
  },
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
  content: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    padding: 24,
    gap: 24,
    paddingBottom: 32,
  },
  greeting: { gap: 6 },
  title: {
    fontSize: 30,
    lineHeight: 38,
    fontFamily: fonts.semibold,
    letterSpacing: -0.6,
  },
  location: { flexDirection: "row", alignItems: "center", gap: 6 },
  muted: { color: colors.muted },
  small: { fontSize: 13, lineHeight: 20, color: colors.muted },
  sectionTitle: { fontSize: 18, lineHeight: 26, fontFamily: fonts.medium },
  stateCard: {
    padding: 20,
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  supplySection: { gap: 12 },
  supplyCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  map: { height: 150, backgroundColor: "#EBF0F2", overflow: "hidden" },
  road: {
    position: "absolute",
    left: -10,
    right: -10,
    height: 2,
    backgroundColor: "#D1DCE0",
  },
  verticalRoad: {
    position: "absolute",
    width: 2,
    height: 190,
    top: -20,
    backgroundColor: "#D1DCE0",
  },
  mapLabel: {
    position: "absolute",
    backgroundColor: colors.primaryPressed,
    color: colors.white,
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    fontFamily: fonts.medium,
  },
  mapCaption: {
    position: "absolute",
    bottom: 8,
    left: 12,
    backgroundColor: colors.white,
    color: colors.muted,
    borderRadius: 4,
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  supplyDetails: { padding: 14, gap: 6 },
  supplyTitle: { fontFamily: fonts.semibold },
  freshness: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.muted,
    textAlign: "center",
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
  selectedLabel: { color: colors.primary, fontFamily: fonts.semibold },
  pressed: { opacity: 0.65 },
  detailContent: {
    padding: 24,
    gap: 18,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
  },
  status: { color: colors.primary, fontFamily: fonts.semibold },
});
