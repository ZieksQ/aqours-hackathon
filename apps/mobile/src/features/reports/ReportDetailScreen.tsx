import {
  useInfiniteQuery,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useRef } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import type { ApiClient } from "../../shared/api";
import { colors } from "../../shared/theme";
import { Button, Field, Icon, Notice, Text } from "../../shared/ui";
import {
  issueLabels,
  ReportProgress,
  reportDate,
  statusLabels,
} from "../home/ReportCard";
import { previewMessage, previewReport } from "../home/preview";
import { reportKeys, reportingApi } from "./api";
import { reportStyles as s } from "./styles";

export function ReportDetailScreen({
  api,
  accountId,
  reportId,
  preview,
  draft,
  onDraftChange,
  backLabel,
  onBack,
}: {
  api: ApiClient;
  accountId: string;
  reportId: string;
  preview: boolean;
  draft: string;
  onDraftChange: (draft: string) => void;
  backLabel: string;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const replyPending =
    useIsMutating({ mutationKey: ["report-reply", accountId, reportId] }) > 0;
  const sending = useRef(false);
  const detail = useQuery({
    queryKey: reportKeys.detail(accountId, reportId),
    enabled: !preview,
    queryFn: ({ signal }) => reportingApi.detail(api, reportId, signal),
    refetchInterval: 30000,
  });
  const report = preview ? previewReport : detail.data;
  const messages = useInfiniteQuery({
    queryKey: reportKeys.messages(accountId, reportId),
    enabled: !preview && !!report,
    initialPageParam: null as number | null,
    queryFn: ({ pageParam, signal }) =>
      reportingApi.messages(api, reportId, pageParam, signal),
    getNextPageParam: (page) => page.nextBefore ?? undefined,
    refetchInterval: 30000,
  });
  const conversation = preview
    ? [previewMessage]
    : [
        ...new Map(
          (
            messages.data?.pages
              .slice()
              .reverse()
              .flatMap((page) => page.items) ?? []
          ).map((message) => [message.id, message]),
        ).values(),
      ];
  const reply = useMutation({
    mutationKey: ["report-reply", accountId, reportId],
    mutationFn: () => reportingApi.reply(api, reportId, draft),
    onSuccess: () => {
      onDraftChange("");
      void queryClient.invalidateQueries({
        queryKey: reportKeys.messages(accountId, reportId),
      });
      void queryClient.invalidateQueries({
        queryKey: reportKeys.all(accountId),
      });
    },
    onError: () => {
      void queryClient.invalidateQueries({
        queryKey: reportKeys.detail(accountId, reportId),
      });
    },
  });
  async function send() {
    if (
      sending.current ||
      replyPending ||
      !draft.trim() ||
      draft.trim().length > 2000 ||
      report?.status !== "InProgress" ||
      preview
    )
      return;
    sending.current = true;
    try {
      await reply.mutateAsync();
    } catch {
      /* The mutation displays the error and retains the draft. */
    } finally {
      sending.current = false;
    }
  }
  return (
    <KeyboardAvoidingView
      style={s.page}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl
            refreshing={
              !preview &&
              (detail.isRefetching ||
                (messages.isRefetching && !messages.isFetchingNextPage))
            }
            onRefresh={() => {
              if (!preview) {
                void detail.refetch();
                void messages.refetch();
              }
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
                Showing the last loaded report. Refresh before replying.
              </Text>
            )}
            <Button
              label="Retry report"
              secondary
              onPress={() => {
                void detail.refetch();
              }}
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
              <Text style={s.small}>
                Submitted {reportDate(report.createdAt)}
              </Text>
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
            <View style={s.section}>
              <Text accessibilityRole="header" style={s.sectionTitle}>
                Supplier conversation
              </Text>
              {!preview && messages.isPending && (
                <View style={s.card}>
                  <ActivityIndicator color={colors.primary} />
                  <Text>Loading conversation…</Text>
                </View>
              )}
              {messages.isError && (
                <View style={s.section}>
                  <Notice>{messages.error.message}</Notice>
                  {conversation.length > 0 && (
                    <Text style={s.small}>
                      Showing the last loaded messages.
                    </Text>
                  )}
                  <Button
                    label="Retry conversation"
                    secondary
                    onPress={() => {
                      void (messages.isFetchNextPageError
                        ? messages.fetchNextPage()
                        : messages.refetch());
                    }}
                  />
                </View>
              )}
              {!preview && messages.hasNextPage && (
                <Button
                  label="Load older messages"
                  secondary
                  loading={messages.isFetchingNextPage}
                  onPress={() => {
                    void messages.fetchNextPage();
                  }}
                />
              )}
              {!conversation.length && (preview || messages.isSuccess) && (
                <View style={s.card}>
                  <Text style={s.muted}>
                    No messages yet. Your supplier’s response will appear here.
                  </Text>
                </View>
              )}
              {conversation.map((message) => (
                <View
                  key={message.id}
                  style={[
                    s.card,
                    message.senderRole !== "Customer" && styles.supplier,
                  ]}
                >
                  <Text style={s.sectionTitle}>
                    {message.senderRole === "Customer"
                      ? "You"
                      : message.senderName}
                  </Text>
                  <Text style={s.small}>
                    {message.senderRole === "Customer"
                      ? "Customer"
                      : "Supplier team"}{" "}
                    · {reportDate(message.createdAt)}
                  </Text>
                  <Text selectable>{message.body}</Text>
                </View>
              ))}
            </View>
            {!preview && report.status === "InProgress" && !detail.isError ? (
              <View style={s.section}>
                <Field
                  nativeID="customer-reply"
                  label="Reply to your supplier"
                  placeholder="Add a message about this report"
                  multiline
                  textAlignVertical="top"
                  maxLength={2000}
                  editable={!replyPending}
                  value={draft}
                  onChangeText={onDraftChange}
                  style={styles.composer}
                />
                <Text style={s.small}>
                  {draft.length.toLocaleString()} / 2,000 characters
                </Text>
                {reply.isError && (
                  <Notice>{`${reply.error.message} Your reply has been kept. Refresh the conversation before trying again if the connection was lost.`}</Notice>
                )}
                <Button
                  label="Send reply"
                  icon="send"
                  loading={replyPending}
                  disabled={!draft.trim()}
                  onPress={() => {
                    void send();
                  }}
                />
              </View>
            ) : (
              <Text style={s.small}>
                {preview
                  ? "Design preview · Sign in to reply."
                  : report.status === "Resolved"
                    ? "This report is resolved. The conversation is available to read."
                    : report.status === "Submitted"
                      ? "You can reply once a supplier team member takes your report."
                      : "Refresh the report to check whether replies are available."}
              </Text>
            )}
            {!preview && (
              <Text style={s.small}>
                Pull down to refresh · Checks for updates every 30 seconds while
                open.
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  supplier: { borderLeftWidth: 4, borderLeftColor: colors.primary },
  composer: { minHeight: 112 },
});
