import {
  useInfiniteQuery,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import {
  Alert,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import type {
  ApiClient,
  Message,
  MessageAttachment,
  Report,
} from "../../shared/api";
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
import {
  imageContentType,
  imageValidationError,
  MAX_MESSAGE_ATTACHMENTS,
  type PickedImage,
} from "./attachments";
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
  const [attachments, setAttachments] = useState<PickedImage[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [pickingImages, setPickingImages] = useState(false);
  const [viewingAttachment, setViewingAttachment] =
    useState<MessageAttachment | null>(null);
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
    mutationFn: () => reportingApi.reply(api, reportId, draft, attachments),
    onSuccess: () => {
      onDraftChange("");
      setAttachments([]);
      setAttachmentError("");
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

  async function choosePhotos() {
    const remaining = MAX_MESSAGE_ATTACHMENTS - attachments.length;
    if (remaining <= 0 || pickingImages || replyPending) return;
    setPickingImages(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        allowsEditing: false,
        quality: 1,
        base64: false,
        exif: false,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
      });
      if (result.canceled) return;
      const next: PickedImage[] = [];
      let error = "";
      for (const [index, asset] of result.assets.entries()) {
        const uriPart = asset.uri.split(/[/?#]/).at(-1) ?? "";
        let uriName = uriPart;
        try {
          uriName = decodeURIComponent(uriPart);
        } catch {
          // Keep the provider's original name when it is not URI encoded.
        }
        const fileName = asset.fileName?.split(/[\\/]/).at(-1) || uriName;
        const nameWithExtension = fileName.includes(".")
          ? fileName
          : asset.mimeType?.toLowerCase() === "image/png"
            ? `${fileName || `photo-${index + 1}`}.png`
            : asset.mimeType?.toLowerCase() === "image/jpeg"
              ? `${fileName || `photo-${index + 1}`}.jpg`
              : fileName;
        const validation = imageValidationError(
          nameWithExtension,
          asset.mimeType,
          asset.fileSize,
        );
        const contentType = imageContentType(nameWithExtension, asset.mimeType);
        if (validation || !contentType) {
          error ||= `${nameWithExtension || "Photo"}: ${validation ?? "Choose a JPG or PNG image."}`;
          continue;
        }
        if (attachments.length + next.length >= MAX_MESSAGE_ATTACHMENTS) {
          error ||= "Attach up to 3 photos per message.";
          break;
        }
        next.push({
          key: asset.assetId ?? asset.uri,
          uri: asset.uri,
          fileName: nameWithExtension,
          contentType,
          sizeBytes: asset.fileSize,
        });
      }
      if (next.length > 0)
        setAttachments((current) =>
          [...current, ...next].slice(0, MAX_MESSAGE_ATTACHMENTS),
        );
      setAttachmentError(error);
    } catch {
      setAttachmentError("Could not open your photo library. Try again.");
    } finally {
      setPickingImages(false);
    }
  }

  async function send() {
    if (
      sending.current ||
      replyPending ||
      (!draft.trim() && attachments.length === 0) ||
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
              return (
                <MessageBubble
                  key={row.key}
                  api={api}
                  reportId={reportId}
                  message={row.message}
                  onViewAttachment={setViewingAttachment}
                />
              );
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
          attachments={attachments}
          attachmentError={attachmentError}
          onAddPhotos={() => void choosePhotos()}
          onRemoveAttachment={(key) =>
            setAttachments((current) =>
              current.filter((attachment) => attachment.key !== key),
            )
          }
          onSend={() => void send()}
          canReply={canReply}
          sending={replyPending}
          pickingImages={pickingImages}
          error={reply.error?.message}
          preview={preview}
        />
      ) : report ? (
        <ReadOnlyComposer status={report.status} stale={detail.isError} />
      ) : null}
      <PhotoViewer
        api={api}
        reportId={reportId}
        attachment={viewingAttachment}
        onClose={() => setViewingAttachment(null)}
      />
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

function MessageBubble({
  api,
  reportId,
  message,
  onViewAttachment,
}: {
  api: ApiClient;
  reportId: string;
  message: Message;
  onViewAttachment: (attachment: MessageAttachment) => void;
}) {
  const customer = message.senderRole === "Customer";
  const attachments = message.attachments ?? [];
  return (
    <View style={customer ? s.outgoingMessage : s.incomingMessage}>
      {!customer && (
        <Text style={s.senderLabel}>{message.senderName} · Supplier team</Text>
      )}
      {message.body?.trim() ? (
        <View style={[s.bubble, customer ? s.customerBubble : s.supplierBubble]}>
          <Text selectable style={s.messageText}>
            {message.body}
          </Text>
        </View>
      ) : null}
      {attachments.length > 0 && (
        <View style={s.attachmentList}>
          {attachments.map((attachment) => (
            <ProtectedPhoto
              key={attachment.id}
              api={api}
              reportId={reportId}
              attachment={attachment}
              onPress={() => onViewAttachment(attachment)}
            />
          ))}
        </View>
      )}
      <Text style={[s.messageTime, customer ? s.outgoingTime : s.incomingTime]}>
        {customer
          ? `${formatTime(message.createdAt)} · You`
          : formatTime(message.createdAt)}
      </Text>
    </View>
  );
}

function ProtectedPhoto({
  api,
  reportId,
  attachment,
  onPress,
  enlarged = false,
}: {
  api: ApiClient;
  reportId: string;
  attachment: MessageAttachment;
  onPress?: () => void;
  enlarged?: boolean;
}) {
  const [source, setSource] = useState<{
    uri: string;
    accessToken: string;
  } | null>(null);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);
  const retriedForToken = useRef(false);

  useEffect(() => {
    let active = true;
    retriedForToken.current = false;
    setSource(null);
    setStatus("loading");
    void api
      .getAccessToken()
      .then((token) => {
        if (!active) return;
        setSource({
          uri: `${api.baseUrl}/api/reports/${encodeURIComponent(reportId)}/attachments/${encodeURIComponent(attachment.id)}`,
          accessToken: token,
        });
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [api, reportId, attachment.id, attempt]);

  async function retryAfterImageError(token: string) {
    if (retriedForToken.current) {
      setStatus("error");
      return;
    }
    retriedForToken.current = true;
    try {
      const nextToken = await api.getAccessTokenAfterImageFailure(token);
      if (nextToken && nextToken !== token) {
        setStatus("loading");
        setSource((current) =>
          current
            ? { ...current, accessToken: nextToken }
            : current,
        );
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  const image = source ? (
    <Image
      key={source.accessToken}
      source={{
        uri: source.uri,
        headers: { Authorization: `Bearer ${source.accessToken}` },
      }}
      resizeMode={enlarged ? "contain" : "cover"}
      style={enlarged ? s.photoViewerImage : s.photoThumbnail}
      accessible={false}
      onLoad={() => setStatus("loaded")}
      onError={() => void retryAfterImageError(source.accessToken)}
    />
  ) : null;
  return (
    <View style={enlarged ? s.photoViewerFrame : s.photoFrame}>
      {status === "error" ? (
        <View style={s.photoError}>
          <Text style={s.photoErrorText}>Photo could not be loaded.</Text>
          <Button
            label="Retry photo"
            secondary
            onPress={() => {
              retriedForToken.current = false;
              setAttempt((value) => value + 1);
            }}
          />
        </View>
      ) : onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open photo: ${attachment.fileName}`}
          onPress={onPress}
          style={({ pressed }) => [s.photoOpen, pressed && s.pressed]}
        >
          {image}
          {status === "loading" && (
            <ActivityIndicator
              color={colors.primary}
              style={s.photoLoadingIndicator}
            />
          )}
        </Pressable>
      ) : (
        <>
          {image}
          {status === "loading" && (
            <View style={s.photoViewerLoading}>
              <ActivityIndicator color={colors.white} />
              <Text style={s.photoViewerLoadingText}>Loading photo…</Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

function PhotoViewer({
  api,
  reportId,
  attachment,
  onClose,
}: {
  api: ApiClient;
  reportId: string;
  attachment: MessageAttachment | null;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={!!attachment}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={s.photoViewer}>
        <View style={s.photoViewerHeader}>
          <Text numberOfLines={1} style={s.photoViewerName}>
            {attachment?.fileName ?? "Photo"}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close photo viewer"
            onPress={onClose}
            style={({ pressed }) => [s.photoViewerClose, pressed && s.pressed]}
          >
            <Icon name="x" color={colors.white} size={22} />
          </Pressable>
        </View>
        {attachment && (
          <ProtectedPhoto
            api={api}
            reportId={reportId}
            attachment={attachment}
            enlarged
          />
        )}
      </View>
    </Modal>
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
  attachments,
  attachmentError,
  onAddPhotos,
  onRemoveAttachment,
  onSend,
  canReply,
  sending,
  pickingImages,
  error,
  preview,
}: {
  draft: string;
  onDraftChange: (draft: string) => void;
  attachments: PickedImage[];
  attachmentError: string;
  onAddPhotos: () => void;
  onRemoveAttachment: (key: string) => void;
  onSend: () => void;
  canReply: boolean;
  sending: boolean;
  pickingImages: boolean;
  error?: string;
  preview: boolean;
}) {
  const disabled =
    !canReply ||
    preview ||
    sending ||
    pickingImages ||
    (!draft.trim() && attachments.length === 0) ||
    draft.trim().length > 2000;
  const errorMessage = error
    ? [
        error,
        "Your message and photos have been kept.",
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
          editable={canReply && !sending && !pickingImages}
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
          accessibilityLabel="Attach photos"
          accessibilityState={{
            disabled:
              !canReply ||
              preview ||
              sending ||
              pickingImages ||
              attachments.length >= MAX_MESSAGE_ATTACHMENTS,
            busy: sending,
          }}
          disabled={
            !canReply ||
            preview ||
            sending ||
            pickingImages ||
            attachments.length >= MAX_MESSAGE_ATTACHMENTS
          }
          onPress={onAddPhotos}
          style={({ pressed }) => [
            s.attachButton,
            pressed && s.pressed,
            (!canReply || preview || sending || pickingImages) &&
              s.disabledAttachButton,
          ]}
        >
          <Icon name="paperclip" size={21} color={colors.primary} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            sending
              ? "Sending message"
              : attachments.length > 0
                ? `Send message with ${attachments.length} photo${attachments.length === 1 ? "" : "s"}`
                : "Send message"
          }
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
      {attachments.length > 0 && (
        <View style={s.draftAttachmentList}>
          {attachments.map((attachment) => (
            <View key={attachment.key} style={s.draftAttachment}>
              <Image
                source={{ uri: attachment.uri }}
                style={s.draftAttachmentImage}
                resizeMode="cover"
                accessible={false}
              />
              <Text numberOfLines={1} style={s.draftAttachmentName}>
                {attachment.fileName}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove photo ${attachment.fileName}`}
                accessibilityState={{ disabled: sending || pickingImages }}
                disabled={sending || pickingImages}
                onPress={() => onRemoveAttachment(attachment.key)}
                style={({ pressed }) => [
                  s.removeAttachment,
                  pressed && !sending && !pickingImages && s.pressed,
                ]}
              >
                <Icon name="x" size={16} color={colors.ink} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
      {(attachmentError || (!preview && canReply)) && (
        <View style={s.attachmentHintRow}>
          {attachmentError ? (
            <Notice>{attachmentError}</Notice>
          ) : (
            <Text style={s.attachmentHint}>
              JPG or PNG · up to 3 photos, 5 MB each
            </Text>
          )}
        </View>
      )}
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
