import { useQuery } from "@tanstack/react-query";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import type { Account, ApiClient, Message, Report } from "../../shared/api";
import { colors, fonts } from "../../shared/theme";
import { Button, Icon, Notice, Text } from "../../shared/ui";
import { ReportCard } from "./ReportCard";
import { previewMessage, previewReport } from "./preview";
import { reportKeys } from "../reports/api";

export function HomeScreen({
  api,
  account,
  preview,
  onCreate,
  onReports,
  onView,
}: {
  api: ApiClient;
  account: Account;
  preview: boolean;
  onCreate: () => void;
  onReports: () => void;
  onView: (report: Report) => void;
}) {
  const reports = useQuery({
    queryKey: reportKeys.latest(account.id),
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
    refetchInterval: 30000,
  });
  const report = preview ? previewReport : reports.data?.items[0];
  const messages = useQuery({
    queryKey: ["messages", account.id, report?.id, "latest"],
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
    refetchInterval: 30000,
  });
  const message = preview
    ? previewMessage
    : messages.data?.items
        .filter((item) => item.senderRole !== "Customer")
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  return (
    <View style={styles.page}>
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
          onPress={onCreate}
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
            onView={() => onView(report)}
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
        <Button label="My reports" secondary onPress={onReports} />
        {!preview && (
          <Text style={styles.freshness}>
            Pull down to refresh
            {reports.dataUpdatedAt
              ? ` · Last checked ${new Date(reports.dataUpdatedAt).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}`
              : ""}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.ground },
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
});
