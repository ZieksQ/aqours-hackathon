import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import type { ApiClient } from "../../shared/api";
import { colors, fonts } from "../../shared/theme";
import { Brand, Button, Field, Notice, Text } from "../../shared/ui";

export function LoginScreen({
  api,
  passwordChange = false,
  voluntaryPasswordChange = false,
  preview = false,
  onPasswordChanged,
  onCancel,
  onPreview,
}: {
  api: ApiClient;
  passwordChange?: boolean;
  voluntaryPasswordChange?: boolean;
  preview?: boolean;
  onPasswordChanged?: () => void;
  onCancel: () => void;
  onPreview: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [validation, setValidation] = useState("");
  const passwordRef = useRef<TextInput>(null);
  const newPasswordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const mutation = useMutation({
    mutationFn: () =>
      passwordChange
        ? api.changePassword(password, newPassword)
        : api.login(email.trim(), password),
    onSuccess: () => {
      Keyboard.dismiss();
      setPassword("");
      setNewPassword("");
      setConfirmation("");
      onPasswordChanged?.();
    },
  });

  function submit() {
    if (mutation.isPending) return;
    mutation.reset();
    if (preview && voluntaryPasswordChange) {
      setValidation(
        "Password changes are unavailable in the design preview. Sign in to change your password.",
      );
      return;
    }
    const message =
      !passwordChange && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
        ? "Enter a valid email address."
        : !password
          ? "Enter your password."
          : passwordChange && newPassword.length < 12
            ? "Use at least 12 characters for your new password."
            : passwordChange && newPassword !== confirmation
              ? "Your new passwords do not match."
              : "";
    setValidation(message);
    if (!message) mutation.mutate();
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
      >
        <View style={styles.header}>
          <Brand />
        </View>
        <View style={styles.center}>
          <View style={styles.intro}>
            <Text accessibilityRole="header" style={styles.title}>
              {voluntaryPasswordChange
                ? "Change password"
                : passwordChange
                  ? "Make your account yours."
                  : "Water concerns, heard."}
            </Text>
            <Text style={styles.subtitle}>
              {voluntaryPasswordChange
                ? "Choose a new password to keep your account secure."
                : passwordChange
                  ? "Choose a new password before you continue. Your supplier provided a temporary one."
                  : "Report a water issue and follow your supplier’s response."}
            </Text>
          </View>
          <View style={styles.card}>
            {!passwordChange && (
              <Field
                nativeID="email"
                label="Email address"
                value={email}
                onChangeText={setEmail}
                placeholder={
                  "name@example.com" /* taste-skill-ignore: input format hint from the approved design. */
                }
                keyboardType="email-address"
                autoComplete="email"
                textContentType="username"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                editable={!mutation.isPending}
              />
            )}
            <Field
              ref={passwordRef}
              nativeID="password"
              label={
                voluntaryPasswordChange
                  ? "Current password"
                  : passwordChange
                    ? "Temporary password"
                    : "Password"
              }
              password
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              autoComplete="current-password"
              textContentType="password"
              returnKeyType={passwordChange ? "next" : "go"}
              onSubmitEditing={
                passwordChange ? () => newPasswordRef.current?.focus() : submit
              }
              editable={!mutation.isPending}
            />
            {passwordChange && (
              <>
                <Field
                  ref={newPasswordRef}
                  nativeID="new-password"
                  label="New password"
                  password
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="At least 12 characters"
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="next"
                  onSubmitEditing={() => confirmRef.current?.focus()}
                  editable={!mutation.isPending}
                />
                <Field
                  ref={confirmRef}
                  nativeID="confirm-password"
                  label="Confirm new password"
                  password
                  value={confirmation}
                  onChangeText={setConfirmation}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="go"
                  onSubmitEditing={submit}
                  editable={!mutation.isPending}
                />
                <Text style={styles.helper}>
                  Include uppercase and lowercase letters, a number, and a
                  symbol.
                </Text>
              </>
            )}
            {(validation || mutation.error) && (
              <Notice>
                {validation || mutation.error?.message || "Please try again."}
              </Notice>
            )}
            <View style={styles.action}>
              <Button
                label={
                  voluntaryPasswordChange
                    ? "Save password"
                    : passwordChange
                      ? "Save password & continue"
                      : "Sign in"
                }
                onPress={submit}
                loading={mutation.isPending}
              />
            </View>
            <Text style={styles.hint}>
              {passwordChange
                ? voluntaryPasswordChange
                  ? "Use your new password the next time you sign in."
                  : "Your new password replaces your temporary password."
                : "Use the account provided by your supplier."}
            </Text>
            {passwordChange && (
              <Button
                label={
                  voluntaryPasswordChange
                    ? "Back to Profile"
                    : "Back to sign in"
                }
                secondary
                onPress={onCancel}
                loading={mutation.isPending}
              />
            )}
          </View>
          {__DEV__ && !passwordChange && (
            <View style={styles.preview}>
              <Button
                label="Preview Home design"
                secondary
                onPress={onPreview}
              />
            </View>
          )}
        </View>
        <Text style={styles.footer}>Aqours · Water reporting & response</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // A single responsive column: viewport width minus equal 24px gutters, capped for tablets.
  page: {
    flexGrow: 1,
    paddingHorizontal: 24,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
  },
  header: { paddingTop: 22, paddingBottom: 16 },
  center: { flex: 1, justifyContent: "center", paddingVertical: 32 },
  intro: { gap: 8, marginBottom: 28 },
  title: {
    fontFamily: fonts.bold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.7,
  },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 20,
    gap: 16,
  },
  action: { paddingTop: 8 },
  hint: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    paddingTop: 4,
  },
  helper: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  preview: { paddingTop: 16 },
  footer: {
    color: colors.muted,
    fontSize: 13,
    textAlign: "center",
    paddingTop: 16,
    paddingBottom: 24,
  },
});
