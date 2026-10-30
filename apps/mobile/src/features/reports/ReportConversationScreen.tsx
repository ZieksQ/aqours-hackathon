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
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import type { ApiClient, Message, Report } from "../../shared/api";
import { colors, fonts } from "../../shared/theme";
import { Button, Icon, Notice, Text } from "../../shared/ui";
import { issueLabels, statusLabels } from "../home/ReportCard";
import {
  previewClaimedAt,
  previewCustomerReply,
  previewMessage,
  previewReport,
  previewResolvedReport,
} from "../home/preview";
import { reportKeys, reportingApi } from "./api";
import { conversationStyles as s } from "./conversationStyles";
import { useReportConnection } from "./useReportConnection";

type TimelineRow =
  | { kind: "day"; key: string; label: string }
  | { kind: "report"; key: string; report: Report }
  | { kind: "message"; key: string; message: Message };

export function ReportConversationScreen({
  api,
  accountId,
  reportId,
  preview,
  draft,
  onDraftChange,
  onBack,
  onViewDetails,
}: {
  api: ApiClient;
  accountId: string;
  reportId: string;
  preview: boolean;
  draft: string;
  onDraftChange: (draft: string) => void;
  onBack: () => void;
  onViewDetails: () => void;
}) {
  const queryClient = useQueryClient();
  useReportConnection(api, accountId, reportId, !preview);
  const scroll = useRef<ScrollView>(null);
  const stickToLatest = useRef(true);
  const sending = useRef(false);
  const replyPending =
    useIsMutating({ mutationKey: ["report-reply", accountId, reportId] }) > 0;
  const detail = useQuery({
    queryKey: reportKeys.detail(accountId, reportId),
    enabled: !preview,
    queryFn: ({ signal }) => reportingApi.detail(api, reportId, signal),
    refetchInterval: 30000,
  });
  const report = preview
    ? reportId === previewResolvedReport.id
      ? previewResolvedReport
      : previewReport
    : detail.data;
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
    ? (reportId === previewResolvedReport.id
        ? [
            {
              ...previewMessage,
              id: "preview-resolved-message",
              body: "Repair on main distribution line completed in Brgy. Commonwealth.",
              createdAt: "2026-10-26T15:30:00+08:00",
            },
          ]
        : [previewMessage, previewCustomerReply]
      ).sort(
        (left, right) =>
          Date.parse(left.createdAt) - Date.parse(right.createdAt),
      )
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
      detail.isError ||
      preview
    )
      return;

    sending.current = true;
    try {
      await reply.mutateAsync();
      stickToLatest.current = true;
      requestAnimationFrame(() =>
        scroll.current?.scrollToEnd({ animated: true }),
      );
    } catch {
      // The error stays visible and the draft remains available to retry.
    } finally {
      sending.current = false;
    }
  }

  const history = report ? buildTimeline(report, conversation) : [];
  const canReply =
    !preview && !detail.isError && report?.status === "InProgress";

  return (
    <KeyboardAvoidingView
      style={s.page}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ConversationHeader onBack={onBack} onViewDetails={onViewDetails} />
      {report && <ReportContext report={report} />}
      {detail.isError && (
        <View style={s.inlineError}>
          <Notice>{detail.error.message}</Notice>
          {report && (
            <Text style={s.errorHint}>
              Showing the last loaded report. Refresh before replying.
            </Text>
          )}
          <Button
            label="Retry report"
            secondary
            onPress={() => void detail.refetch()}
          />
        </View>
      )}
      <ScrollView
        ref={scroll}
        style={s.thread}
        contentContainerStyle={s.threadContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        scrollEventThrottle={16}
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } =
            event.nativeEvent;
          stickToLatest.current =
            contentSize.height - contentOffset.y - layoutMeasurement.height <
            96;
        }}
        onContentSizeChange={() => {
          if (stickToLatest.current)
            scroll.current?.scrollToEnd({ animated: false });
        }}
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
        {!report && !preview && detail.isPending && (
          <View style={s.loading}>
            <ActivityIndicator color={colors.primary} />
            <Text style={s.bodyMuted}>Loading your report…</Text>
          </View>
        )}
        {!report && !detail.isPending && !detail.isError && (
          <Text style={s.bodyMuted}>This report is unavailable.</Text>
        )}
        {report && (
          <>
            {!preview && messages.hasNextPage && (
              <Button
                label={
                  messages.isFetchingNextPage
                    ? "Loading older messages…"
                    : "Load older messages"
                }
                secondary
                loading={messages.isFetchingNextPage}
                onPress={() => {
                  stickToLatest.current = false;
                  void messages.fetchNextPage();
                }}
              />
            )}
            {messages.isPending && !preview && conversation.length === 0 && (
              <View style={s.loading}>
                <ActivityIndicator color={colors.primary} />
                <Text style={s.bodyMuted}>Loading conversation…</Text>
              </View>
            )}
            {messages.isError && !preview && (
              <View style={s.messageError}>
                <Notice>{messages.error.message}</Notice>
                {conversation.length > 0 && (
                  <Text style={s.bodyMuted}>
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
            {history.map((row) => {
              if (row.kind === "day")
                return <DayDivider key={row.key} label={row.label} />;
              if (row.kind === "report")
                return (
                  <View key={row.key}>
                    <ReportBubble report={row.report} />
                    {row.report.status === "InProgress" && (
                      <StatusEvent
                        preview={preview}
                        status={row.report.status}
                      />
                    )}
                  </View>
                );
              return <MessageBubble key={row.key} message={row.message} />;
            })}
            {report.status === "Resolved" && (
              <StatusEvent status={report.status} preview={false} />
            )}
            {conversation.length === 0 && (preview || messages.isSuccess) && (
              <Text style={s.emptyMessage}>
                No supplier replies yet. Your supplier’s response will appear
                here.
              </Text>
            )}
          </>
        )}
      </ScrollView>
      {report && (canReply || preview) ? (
        <ReplyComposer
          draft={draft}
          onDraftChange={onDraftChange}
          onSend={() => void send()}
          canReply={canReply}
          sending={replyPending}
          error={reply.error?.message}
          preview={preview}
        />
      ) : report ? (
        <ReadOnlyComposer status={report.status} stale={detail.isError} />
      ) : null}
    </KeyboardAvoidingView>
  );
}

function ConversationHeader({
  onBack,
  onViewDetails,
}: {
  onBack: () => void;
  onViewDetails: () => void;
}) {
  const ios = Platform.OS === "ios";
  return (
    <View style={[s.navBar, ios ? s.iosNavBar : s.androidNavBar]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to report details"
        onPress={onBack}
        style={({ pressed }) => [s.backButton, pressed && s.pressed]}
      >
        <Icon name="arrow-left" size={ios ? 20 : 24} color={colors.primary} />
        {ios && <Text style={s.iosBackLabel}>Details</Text>}
      </Pressable>
      {ios ? (
        <Text accessibilityRole="header" style={s.iosTitle}>
          Conversation
        </Text>
      ) : (
        <Text accessibilityRole="header" style={s.androidTitle}>
          Conversation
        </Text>
      )}
      {!ios && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More conversation options"
          onPress={() =>
            Alert.alert("Conversation", undefined, [
              { text: "View report details", onPress: onViewDetails },
              { text: "Cancel", style: "cancel" },
            ])
          }
          style={({ pressed }) => [s.iconButton, pressed && s.pressed]}
        >
          <Icon name="more-vertical" size={22} color={colors.ink} />
        </Pressable>
      )}
    </View>
  );
}

function ReportContext({ report }: { report: Report }) {
  const issue =
    report.issueType === "LowPressure"
      ? "Low pressure"
      : issueLabels[report.issueType];
  const location = [
    report.address.barangayName,
    report.address.cityMunicipalityName,
  ]
    .filter(Boolean)
    .join(" · ");
  const statusContainerStyle =
    report.status === "Submitted"
      ? s.statusSubmitted
      : report.status === "Resolved"
        ? s.statusResolved
        : s.statusInProgress;
  const statusTextStyle =
    report.status === "Submitted"
      ? s.statusSubmittedText
      : report.status === "Resolved"
        ? s.statusResolvedText
        : s.statusInProgressText;
  const statusDotStyle =
    report.status === "Submitted"
      ? s.statusSubmittedDot
      : report.status === "Resolved"
        ? s.statusResolvedDot
        : s.statusInProgressDot;

  return (
    <View style={s.context}>
      <View style={s.contextTop}>
        <Text numberOfLines={1} style={s.issueTitle}>
          {issue}
        </Text>
        <Text style={s.reference}>{report.id}</Text>
        <View style={[s.status, statusContainerStyle]}>
          <View style={[s.statusDot, statusDotStyle]} />
          <Text style={[s.statusText, statusTextStyle]}>
            {statusLabels[report.status]}
          </Text>
        </View>
      </View>
      {!!location && (
        <View style={s.locationRow}>
          <Icon name="map-pin" size={17} color={colors.muted} />
          <Text numberOfLines={1} style={s.location}>
            {location}
          </Text>
        </View>
      )}
    </View>
  );
}

function DayDivider({ label }: { label: string }) {
  return (
    <View style={s.dayDivider}>
      <Text style={s.dayLabel}>{label}</Text>
    </View>
  );
}

function ReportBubble({ report }: { report: Report }) {
  return (
    <View style={s.outgoingMessage}>
      <View style={[s.bubble, s.customerBubble]}>
        <Text selectable style={s.messageText}>
          {report.description}
        </Text>
      </View>
      <Text style={s.messageTime}>{formatTime(report.createdAt)} · You</Text>
    </View>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const customer = message.senderRole === "Customer";
  return (
    <View style={customer ? s.outgoingMessage : s.incomingMessage}>
      {!customer && (
        <Text style={s.senderLabel}>{message.senderName} · Supplier team</Text>
      )}
      <View style={[s.bubble, customer ? s.customerBubble : s.supplierBubble]}>
        <Text selectable style={s.messageText}>
          {message.body}
        </Text>
      </View>
      <Text style={[s.messageTime, customer ? s.outgoingTime : s.incomingTime]}>
        {customer
          ? `${formatTime(message.createdAt)} · You`
          : formatTime(message.createdAt)}
      </Text>
    </View>
  );
}

function StatusEvent({
  status,
  preview,
}: {
  status: Report["status"];
  preview: boolean;
}) {
  const resolved = status === "Resolved";
  const title = preview
    ? "Alex Reyes took your report"
    : resolved
      ? "This report has been resolved"
      : "A supplier staff member took this report";
  const detail = preview
    ? `In progress · ${formatTime(previewClaimedAt)}`
    : statusLabels[status];
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[s.statusEvent, resolved && s.resolvedEvent]}
    >
      <Icon
        name={resolved ? "check-circle" : "clipboard"}
        size={16}
        color={colors.primary}
      />
      <View style={s.eventCopy}>
        <Text style={s.eventTitle}>{title}</Text>
        <Text style={s.eventDetail}>{detail}</Text>
      </View>
    </View>
  );
}

function ReplyComposer({
  draft,
  onDraftChange,
  onSend,
  canReply,
  sending,
  error,
  preview,
}: {
  draft: string;
  onDraftChange: (draft: string) => void;
  onSend: () => void;
  canReply: boolean;
  sending: boolean;
  error?: string;
  preview: boolean;
}) {
  const disabled =
    !canReply ||
    preview ||
    sending ||
    !draft.trim() ||
    draft.trim().length > 2000;
  const errorMessage = error
    ? [
        error,
        "Your reply has been kept.",
        "Refresh the conversation before trying again if the connection was lost.",
      ].join(" ")
    : undefined;
  return (
    <View style={s.composer}>
      <View style={s.composerTop}>
        <Text style={s.characterCount}>
          {draft.length.toLocaleString()} / 2,000
        </Text>
      </View>
      <View style={s.composerRow}>
        <TextInput
          accessibilityLabel="Message your supplier"
          editable={canReply && !sending}
          maxLength={2000}
          multiline
          onChangeText={onDraftChange}
          placeholder="Message your supplier"
          placeholderTextColor={colors.muted}
          textAlignVertical="top"
          value={draft}
          style={[s.composerInput, !canReply && s.disabledInput]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={sending ? "Sending message" : "Send message"}
          accessibilityState={{ disabled, busy: sending }}
          disabled={disabled}
          onPress={onSend}
          style={({ pressed }) => [
            s.sendButton,
            disabled && s.disabledSendButton,
            pressed && !disabled && s.pressed,
          ]}
        >
          {sending ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Icon name="send" size={21} color={colors.white} />
          )}
        </Pressable>
      </View>
      {errorMessage && (
        <View style={s.composerError}>
          <Notice>{errorMessage}</Notice>
        </View>
      )}
      <View style={s.helperRow}>
        <Icon name="info" size={15} color={colors.muted} />
        <Text style={s.helperText}>
          {preview
            ? "Design preview · Sign in to reply."
            : "Replies are visible to your supplier team."}
        </Text>
      </View>
    </View>
  );
}

function ReadOnlyComposer({
  status,
  stale,
}: {
  status: Report["status"];
  stale: boolean;
}) {
  const message = stale
    ? "Refresh the report to check whether replies are available."
    : status === "Resolved"
      ? "This report is resolved. The conversation is available to read."
      : "You can reply once a supplier team member takes your report.";
  return (
    <View style={s.readOnlyComposer}>
      <Icon
        name={status === "Submitted" ? "clock" : "lock"}
        size={18}
        color={colors.muted}
      />
      <Text style={s.readOnlyText}>{message}</Text>
    </View>
  );
}

function buildTimeline(report: Report, messages: Message[]): TimelineRow[] {
  const rows: TimelineRow[] = [];
  let lastDay = "";
  const appendDay = (createdAt: string, key: string) => {
    const day = localDayKey(createdAt);
    if (day !== lastDay) {
      rows.push({ kind: "day", key: `day-${key}`, label: dayLabel(createdAt) });
      lastDay = day;
    }
  };

  appendDay(report.createdAt, "report");
  rows.push({ kind: "report", key: "report-original", report });
  messages.forEach((message) => {
    appendDay(message.createdAt, message.id);
    rows.push({ kind: "message", key: message.id, message });
  });
  return rows;
}

function localDayKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
  });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });
}
