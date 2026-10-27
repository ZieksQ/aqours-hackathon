import { useQuery } from "@tanstack/react-query";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import type { ApiClient } from "../../shared/api";
import { colors } from "../../shared/theme";
import { Button, Icon, Notice, Text } from "../../shared/ui";
import {
  issueLabels,
  ReportProgress,
  reportDate,
  statusLabels,
} from "../home/ReportCard";
import { previewReport } from "../home/preview";
import { reportKeys, reportingApi } from "./api";
import { reportStyles as s } from "./styles";

export function ReportDetailScreen({
  api,
  accountId,
  reportId,
  preview,
  backLabel,
  onBack,
  onOpenConversation,
}: {
  api: ApiClient;
  accountId: string;
  reportId: string;
  preview: boolean;
  backLabel: string;
  onBack: () => void;
  onOpenConversation: () => void;
}) {
  const detail = useQuery({
    queryKey: reportKeys.detail(accountId, reportId),
    enabled: !preview,
    queryFn: ({ signal }) => reportingApi.detail(api, reportId, signal),
    refetchInterval: 30000,
  });
  const report = preview ? previewReport : detail.data;

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl
          refreshing={!preview && detail.isRefetching}
          onRefresh={() => {
            if (!preview) void detail.refetch();
          }}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      <Button
        label={backLabel}
        icon="arrow-left"
        secondary
        onPress={onBack}
      />
      <Text accessibilityRole="header" style={s.title}>
        Report details
      </Text>
      {!preview && detail.isPending && (
        <View style={s.card}>
          <ActivityIndicator color={colors.primary} />
          <Text>Loading your report…</Text>
        </View>
      )}
      {detail.isError && (
        <View style={s.section}>
          <Notice>{detail.error.message}</Notice>
          {report && (
            <Text style={s.small}>
              Showing the last loaded report. Refresh to check its latest status.
            </Text>
          )}
          <Button
            label="Retry report"
            secondary
            onPress={() => void detail.refetch()}
          />
        </View>
      )}
      {report && (
        <>
          <View style={s.card}>
            <View style={s.row}>
              <Text style={s.sectionTitle}>
                {issueLabels[report.issueType]}
              </Text>
              <Text style={s.status}>{statusLabels[report.status]}</Text>
            </View>
            <Text style={s.small}>Submitted {reportDate(report.createdAt)}</Text>
            <Text selectable style={s.small}>
              Reference: {report.id}
            </Text>
            <ReportProgress status={report.status} />
          </View>
          <View style={s.section}>
            <Text accessibilityRole="header" style={s.sectionTitle}>
              What you reported
            </Text>
            <Text selectable>{report.description}</Text>
          </View>
          <View style={s.card}>
            <View style={s.row}>
              <Text accessibilityRole="header" style={s.sectionTitle}>
                Report location
              </Text>
              <Icon name="map-pin" size={20} />
            </View>
            <Text selectable>
              {[
                report.address.details,
                report.address.barangayName,
                report.address.subMunicipalityName,
                report.address.cityMunicipalityName,
                report.address.provinceName,
                report.address.regionName,
              ]
                .filter(Boolean)
                .join(", ")}
            </Text>
            <Text selectable style={s.small}>
              {report.latitude.toFixed(6)}, {report.longitude.toFixed(6)}
            </Text>
          </View>
          <View style={s.card}>
            <Text accessibilityRole="header" style={s.sectionTitle}>
              Supplier conversation
            </Text>
            <Text style={s.muted}>
              Read supplier messages and reply to this report.
            </Text>
            <Button
              label="Open conversation"
              icon="message-circle"
              onPress={onOpenConversation}
            />
          </View>
        </>
      )}
    </ScrollView>
  );
}
