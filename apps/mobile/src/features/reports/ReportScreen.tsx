import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { ApiError, type ApiClient, type Report } from "../../shared/api";
import { colors, fonts } from "../../shared/theme";
import { Button, Field, Icon, Notice, Text } from "../../shared/ui";
import { reportingApi, reportKeys } from "./api";
import { validateReport, type ReportDraft } from "./form";
import { loadRegion, regions } from "./locations";
import {
  addressCodes,
  locationLabel,
  resolveLocationPath,
} from "./location-tree";
import { LocationPicker } from "./LocationPicker";
import { LocationSelect } from "./LocationSelect";
import { reportStyles as s } from "./styles";

export function ReportScreen({
  api,
  accountId,
  draft,
  setDraft,
  preview,
  onSubmitted,
}: {
  api: ApiClient;
  accountId: string;
  draft: ReportDraft;
  setDraft: Dispatch<SetStateAction<ReportDraft>>;
  preview: boolean;
  onSubmitted: (report: Report) => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submitting = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const queryClient = useQueryClient();
  const path = resolveLocationPath(
    loadRegion(draft.locationCodes[0]),
    draft.locationCodes,
  );
  const mutation = useMutation({
    mutationKey: ["submit-report", accountId],
    mutationFn: () =>
      reportingApi.submit(api, {
        issueType: draft.issueType!,
        description: draft.description.trim(),
        address: { ...addressCodes(path), details: draft.details.trim() },
        latitude: draft.coordinates!.latitude,
        longitude: draft.coordinates!.longitude,
      }),
    onSuccess: (report) => {
      queryClient.setQueryData(reportKeys.latest(accountId), {
        items: [report],
      });
      queryClient.setQueryData(reportKeys.detail(accountId, report.id), report);
      void queryClient.invalidateQueries({
        queryKey: reportKeys.all(accountId),
      });
      onSubmitted(report);
    },
  });
  const pending = mutation.isPending;
  function update(patch: Partial<ReportDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }
  async function submit() {
    if (submitting.current || preview) return;
    const next = validateReport(
      draft,
      path[path.length - 1]?.geographic_level === "barangay",
    );
    setErrors(next);
    if (Object.keys(next).length) {
      scroll.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    submitting.current = true;
    try {
      await mutation.mutateAsync();
    } catch {
      scroll.current?.scrollTo({ y: 0, animated: true });
    } finally {
      submitting.current = false;
    }
  }
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={s.page}
    >
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={s.content}
      >
        <View style={s.section}>
          <Text accessibilityRole="header" style={s.title}>
            Report a problem
          </Text>
          <Text style={s.muted}>
            Tell your supplier what’s happening and where the problem is.
          </Text>
        </View>
        {preview && (
          <Text style={s.small}>
            Design preview · Explore the form. Sign in to submit a report.
          </Text>
        )}
        {!!Object.keys(errors).length && (
          <Notice>{Object.values(errors).join(" ")}</Notice>
        )}
        {mutation.isError && (
          <Notice>
            {mutation.error.message +
              (mutation.error instanceof ApiError &&
              (mutation.error.status === 0 || mutation.error.status >= 500)
                ? " Your draft is saved on this screen. Check My reports before submitting again in case your report was received."
                : "")}
          </Notice>
        )}
        <View style={s.section}>
          <Text accessibilityRole="header" style={s.sectionTitle}>
            What is the issue?
          </Text>
          <View
            style={styles.issues}
            accessibilityRole="radiogroup"
            accessibilityLabel="Water issue type"
          >
            {(
              [
                ["NoWater", "No water", "home"],
                ["LowPressure", "Low pressure", "activity"],
                ["DirtyWater", "Dirty water", "droplet"],
              ] as const
            ).map(([type, label, icon]) => (
              <Pressable
                key={type}
                disabled={pending}
                accessibilityRole="radio"
                accessibilityLabel={label}
                accessibilityState={{
                  checked: draft.issueType === type,
                  disabled: pending,
                }}
                style={({ pressed }) => [
                  styles.issue,
                  draft.issueType === type && styles.selected,
                  pressed && s.pressed,
                ]}
                onPress={() => update({ issueType: type })}
              >
                <Icon
                  name={icon}
                  color={
                    draft.issueType === type ? colors.primary : colors.muted
                  }
                />
                <Text
                  style={[
                    styles.issueLabel,
                    draft.issueType === type && styles.selectedLabel,
                  ]}
                >
                  {label}
                </Text>
                {draft.issueType === type && (
                  <View style={styles.checked}>
                    <Icon name="check-circle" size={14} />
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </View>
        <View style={s.section}>
          <Field
            nativeID="report-description"
            label="Description"
            multiline
            textAlignVertical="top"
            autoCapitalize="sentences"
            autoCorrect
            maxLength={2000}
            editable={!pending}
            value={draft.description}
            onChangeText={(description) => update({ description })}
            placeholder="Describe the water issue and when it started."
            style={styles.description}
          />
          <Text style={[s.small, styles.counter]}>
            {draft.description.length.toLocaleString()} / 2,000 characters
          </Text>
        </View>
        <View style={s.section}>
          <Text accessibilityRole="header" style={s.sectionTitle}>
            Location details
          </Text>
          <LocationSelect
            label="Region"
            options={regions}
            value={draft.locationCodes[0]}
            disabled={pending}
            onChange={(code) => update({ locationCodes: [code] })}
          />
          {path.map(
            (node, index) =>
              node.children.length > 0 && (
                <LocationSelect
                  key={node.psgc_code}
                  label={locationLabel(node.children)}
                  options={node.children}
                  value={draft.locationCodes[index + 1]}
                  disabled={pending}
                  onChange={(code) =>
                    update({
                      locationCodes: [
                        ...draft.locationCodes.slice(0, index + 1),
                        code,
                      ],
                    })
                  }
                />
              ),
          )}
          <Field
            nativeID="report-address"
            label="Street address / landmark"
            autoCapitalize="words"
            value={draft.details}
            editable={!pending}
            onChangeText={(details) => update({ details })}
            maxLength={500}
            placeholder="House number, street, or a nearby landmark"
          />
        </View>
        <LocationPicker
          value={draft.coordinates}
          disabled={pending}
          onChange={(coordinates) => update({ coordinates })}
        />
        <Button
          label={preview ? "Sign in to submit a report" : "Submit report"}
          icon="send"
          loading={pending}
          disabled={preview}
          onPress={() => {
            void submit();
          }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  issues: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  issue: {
    flex: 1,
    minWidth: 80,
    minHeight: 92,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 6,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.white,
  },
  selected: {
    borderColor: colors.primary,
    outlineColor: colors.primary,
    outlineWidth: 1,
    backgroundColor: colors.pale,
  },
  issueLabel: {
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  selectedLabel: { color: colors.primaryPressed, fontFamily: fonts.semibold },
  checked: { position: "absolute", top: 6, right: 6 },
  description: { minHeight: 128 },
  counter: { textAlign: "right" },
});
