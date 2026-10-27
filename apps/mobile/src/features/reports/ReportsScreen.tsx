import { useInfiniteQuery } from "@tanstack/react-query";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import type { ApiClient, Report } from "../../shared/api";
import { colors } from "../../shared/theme";
import { Button, Icon, Notice, Text } from "../../shared/ui";
import { issueLabels, reportDate, statusLabels } from "../home/ReportCard";
import { previewReport } from "../home/preview";
import { reportingApi, reportKeys } from "./api";
import { reportStyles as s } from "./styles";

export function ReportsScreen({
  api,
  accountId,
  preview,
  onView,
  onCreate,
  onBack,
}: {
  api: ApiClient;
  accountId: string;
  preview: boolean;
  onView: (report: Report) => void;
  onCreate: () => void;
  onBack: () => void;
}) {
  const reports = useInfiniteQuery({
    queryKey: [...reportKeys.all(accountId), "history"],
    enabled: !preview,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      reportingApi.list(api, pageParam, signal),
    getNextPageParam: (page) =>
      page.page * page.pageSize < page.totalCount && page.items.length > 0
        ? page.page + 1
        : undefined,
    staleTime: 30000,
  });
  const items = preview
    ? [previewReport]
    : [
        ...new Map(
          (reports.data?.pages.flatMap((page) => page.items) ?? []).map(
            (report) => [report.id, report],
          ),
        ).values(),
      ];
  return (
    <ScrollView
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl
          refreshing={
            !preview && reports.isRefetching && !reports.isFetchingNextPage
          }
          onRefresh={() => {
            if (!preview) void reports.refetch();
          }}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      <Button
        label="Back to Home"
        icon="arrow-left"
        secondary
        onPress={onBack}
      />
      <View style={s.section}>
        <Text accessibilityRole="header" style={s.title}>
          My reports
        </Text>
        <Text style={s.muted}>
          Follow your water issues and your supplier’s response.
        </Text>
      </View>
      <Button
        label="Report a water issue"
        icon="plus-circle"
        onPress={onCreate}
      />
      {!preview && reports.isPending && (
        <View style={s.card}>
          <ActivityIndicator color={colors.primary} />
          <Text>Loading your reports…</Text>
        </View>
      )}
      {reports.isError && (
        <View style={s.section}>
          <Notice>{reports.error.message}</Notice>
          {items.length > 0 && (
            <Text style={s.small}>Showing your last loaded reports.</Text>
          )}
          <Button
            label="Retry reports"
            secondary
            onPress={() => {
              void (reports.isFetchNextPageError
                ? reports.fetchNextPage()
                : reports.refetch());
            }}
          />
        </View>
      )}
      {(preview || reports.data) && (
        <Text style={s.small}>
          Showing {items.length} of{" "}
          {preview ? 1 : reports.data!.pages[0].totalCount} reports
        </Text>
      )}
      {!preview && reports.isSuccess && !items.length && (
        <View style={s.card}>
          <Text style={s.sectionTitle}>No reports yet</Text>
          <Text style={s.muted}>
            Submit a water issue to follow its progress here.
          </Text>
        </View>
      )}
      {items.map((report) => (
        <Pressable
          key={report.id}
          accessibilityRole="button"
          accessibilityLabel={`${issueLabels[report.issueType]}, ${statusLabels[report.status]}, submitted ${reportDate(report.createdAt)}`}
          onPress={() => onView(report)}
          style={({ pressed }) => [s.card, pressed && s.pressed]}
        >
          <View style={s.row}>
            <Text style={s.sectionTitle}>{issueLabels[report.issueType]}</Text>
            <Icon name="arrow-up-right" size={20} />
          </View>
          <View style={s.row}>
            <Text style={s.status}>{statusLabels[report.status]}</Text>
            <Text style={s.small}>{reportDate(report.createdAt)}</Text>
          </View>
          <Text style={s.small}>
            {report.address.barangayName}, {report.address.cityMunicipalityName}
          </Text>
          <Text numberOfLines={2}>{report.description}</Text>
          <Text numberOfLines={1} style={s.small}>
            Reference: {report.id}
          </Text>
        </Pressable>
      ))}
      {!preview && reports.hasNextPage && (
        <Button
          label="Load more reports"
          secondary
          loading={reports.isFetchingNextPage}
          onPress={() => {
            void reports.fetchNextPage();
          }}
        />
      )}
    </ScrollView>
  );
}
