import Feather from "@expo/vector-icons/Feather";
import { forwardRef, useState, type ComponentProps } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text as NativeText,
  TextInput,
  View,
} from "react-native";
import { colors, fonts } from "./theme";

export function Text({ style, ...props }: ComponentProps<typeof NativeText>) {
  return <NativeText {...props} style={[styles.text, style]} />;
}

export function Icon(props: ComponentProps<typeof Feather>) {
  return (
    <Feather
      accessible={false}
      importantForAccessibility="no"
      size={22}
      color={colors.primary}
      {...props}
    />
  );
}

export function Brand() {
  return (
    <View style={styles.brand} accessible accessibilityLabel="Aqours">
      <Image
        source={require("../../assets/brand-mark.png")}
        style={styles.mark}
        accessible={false}
      />
      <Text style={styles.wordmark}>Aqours</Text>
    </View>
  );
}

export function Button({
  label,
  onPress,
  loading,
  disabled = false,
  secondary = false,
  icon,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  secondary?: boolean;
  icon?: ComponentProps<typeof Feather>["name"];
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: loading || disabled, busy: loading }}
      disabled={loading || disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        pressed && styles.pressed,
        (loading || disabled) && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={secondary ? colors.primary : colors.white} />
      ) : (
        <>
          {icon && (
            <Icon
              name={icon}
              size={20}
              color={secondary ? colors.primary : colors.white}
            />
          )}
          <Text style={[styles.buttonText, secondary && styles.secondaryText]}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export const Field = forwardRef<
  TextInput,
  ComponentProps<typeof TextInput> & { label: string; password?: boolean }
>(function Field(
  {
    label,
    password = false,
    style,
    autoCapitalize = "none",
    autoCorrect = false,
    ...props
  },
  ref,
) {
  const [revealed, setRevealed] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label} nativeID={`${props.nativeID}-label`}>
        {label}
      </Text>
      <View style={[styles.inputFrame, focused && styles.inputFocused]}>
        <TextInput
          {...props}
          ref={ref}
          accessibilityLabel={label}
          accessibilityLabelledBy={`${props.nativeID}-label`}
          placeholderTextColor={colors.muted}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          secureTextEntry={password && !revealed}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.input, style]}
        />
        {password && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? "Hide password" : "Show password"}
            accessibilityState={{ checked: revealed }}
            onPress={() => setRevealed(!revealed)}
            style={styles.reveal}
          >
            <Icon
              name={revealed ? "eye-off" : "eye"}
              color={colors.muted}
              size={20}
            />
          </Pressable>
        )}
      </View>
    </View>
  );
});

export function Notice({ children }: { children: string }) {
  return (
    <View
      style={styles.notice}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.noticeText}>{children}</Text>
    </View>
  );
}

export function BackButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
    >
      <View style={styles.backCircle}>
        <Icon name="arrow-left" size={18} color={colors.primary} />
      </View>
      <Text style={styles.backLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  text: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  mark: { width: 24, height: 28 },
  wordmark: {
    fontFamily: fonts.semibold,
    fontSize: 22,
    lineHeight: 30,
    color: colors.primary,
  },
  button: {
    minHeight: 50,
    padding: 13,
    borderRadius: 12,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buttonText: {
    color: colors.white,
    fontFamily: fonts.semibold,
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
  },
  secondary: { backgroundColor: colors.pale },
  secondaryText: { color: colors.primary },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.6 },
  field: { gap: 6 },
  label: { fontSize: 14, lineHeight: 20, fontFamily: fonts.medium },
  inputFrame: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.white,
  },
  inputFocused: {
    borderColor: colors.primary,
    outlineColor: colors.primary,
    outlineWidth: 1,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 50,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
  },
  reveal: {
    minWidth: 46,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  notice: { padding: 12, backgroundColor: colors.errorGround, borderRadius: 8 },
  noticeText: { color: colors.error, fontSize: 14, lineHeight: 20 },
  backButton: {
    minHeight: 44,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingRight: 12,
  },
  backCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  backLabel: { fontSize: 14, lineHeight: 20, fontFamily: fonts.medium, color: colors.primaryPressed },
});
