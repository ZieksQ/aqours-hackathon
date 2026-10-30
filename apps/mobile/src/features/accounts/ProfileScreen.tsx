import { useState, type ComponentProps } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Account, ApiClient } from "../../shared/api";
import { accountScreenStyles as s } from "../../shared/accountScreenStyles";
import { colors, fonts } from "../../shared/theme";
import { BackButton, Button, Icon, Text } from "../../shared/ui";
import { LoginScreen } from "./LoginScreen";

export function ProfileScreen({
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
  const [panel, setPanel] = useState<"password" | "about" | "privacy" | null>(
    null,
  );
  const name = `${account.firstName} ${account.lastName}`;
  function signOut() {
    Alert.alert(
      "Sign out?",
      "You will need to sign in again to access your reports.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: onSignOut },
      ],
    );
  }
  return (
    <>
      <ScrollView style={s.page} contentContainerStyle={s.content}>
        <View>
          <Text accessibilityRole="header" style={s.title}>
            Profile
          </Text>
          <Text style={[s.subtitle, styles.subtitle]}>
            Your account and security
          </Text>
        </View>
        <View style={[s.card, styles.identity]}>
          <View style={styles.avatar}>
            <Text style={styles.initials}>
              {`${account.firstName[0] ?? ""}${account.lastName[0] ?? ""}`.toUpperCase()}
            </Text>
          </View>
          <View style={styles.identityInfo}>
            <View style={styles.identityHeading}>
              <Text numberOfLines={1} style={styles.name}>
                {name}
              </Text>
              <Text style={styles.customer}>Customer</Text>
            </View>
            <Text numberOfLines={1} style={styles.email}>
              {account.email}
            </Text>
          </View>
        </View>
        <View style={s.section}>
          <Text accessibilityRole="header" style={s.caption}>
            Account details
          </Text>
          <View style={s.card}>
            {[
              ["Full name", name],
              ["Registered email", account.email],
              [
                "Service area",
                preview ? "Commonwealth, Quezon City" : "Not provided",
              ],
            ].map(([label, value], index) => (
              <View
                key={label}
                style={[styles.detail, index > 0 && styles.divider]}
              >
                <Text style={styles.detailLabel}>{label}</Text>
                <Text selectable style={styles.detailValue}>
                  {value}
                </Text>
              </View>
            ))}
          </View>
        </View>
        <View style={s.section}>
          <Text accessibilityRole="header" style={s.caption}>
            Security
          </Text>
          <View style={s.card}>
            <ProfileAction
              icon="lock"
              label="Change password"
              onPress={() => setPanel("password")}
            />
          </View>
        </View>
        <View style={s.section}>
          <Text accessibilityRole="header" style={s.caption}>
            Support &amp; Legal
          </Text>
          <View style={s.card}>
            <ProfileAction
              icon="info"
              label="About Aqours"
              onPress={() => setPanel("about")}
            />
            <View style={styles.divider}>
              <ProfileAction
                icon="shield"
                label="Privacy Policy"
                onPress={() => setPanel("privacy")}
              />
            </View>
          </View>
        </View>
        <View style={[s.card, styles.signOut]}>
          <ProfileAction
            icon="log-out"
            label="Sign out"
            destructive
            onPress={signOut}
          />
        </View>
        <Text style={styles.footer}>
          Aqours · Water reporting &amp; response
        </Text>
      </ScrollView>
      <Modal
        visible={panel !== null}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setPanel(null)}
      >
        <SafeAreaView style={s.page}>
          {panel === "password" ? (
            <LoginScreen
              api={api}
              passwordChange
              voluntaryPasswordChange
              preview={preview}
              onPasswordChanged={() => {
                setPanel(null);
                Alert.alert(
                  "Password changed",
                  "Use your new password the next time you sign in.",
                );
              }}
              onCancel={() => setPanel(null)}
              onPreview={() => {}}
            />
          ) : (
            <ScrollView contentContainerStyle={s.content}>
              <BackButton label="Back to Profile" onPress={() => setPanel(null)} />
              <Text accessibilityRole="header" style={s.title}>
                {panel === "about" ? "About Aqours" : "Privacy Policy"}
              </Text>
              {panel === "about" ? (
                <Text>
                  Aqours connects customers with their water supplier. Report a
                  water issue, follow its progress, and read your supplier’s
                  responses.
                </Text>
              ) : (
                <>
                  <Text accessibilityRole="header" style={styles.name}>
                    How the app uses your information
                  </Text>
                  <Text>
                    Your account identifies you to your supplier. Reports
                    include the description, address, map location, and messages
                    you submit. Authorized supplier personnel can access report
                    locations to respond to water concerns.
                  </Text>
                  <Text>
                    Location permission is optional. The report form reads your
                    current location only when you request it; you can also
                    choose a map pin manually.
                  </Text>
                  <Text>
                    Sign-in tokens and update read status are kept in app memory
                    and cleared when you sign out. Closing the app requires
                    signing in again.
                  </Text>
                  <Text style={s.small}>
                    A supplier privacy policy has not been provided. Contact
                    your supplier for its official policy, data retention terms,
                    and privacy requests.
                  </Text>
                </>
              )}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </>
  );
}
function ProfileAction({
  icon,
  label,
  onPress,
  destructive = false,
}: {
  icon: ComponentProps<typeof Icon>["name"];
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && s.pressed]}
    >
      <Icon name={icon} size={20} color={destructive ? "#BA322A" : "#3F484C"} />
      <Text style={[styles.actionLabel, destructive && styles.destructive]}>
        {label}
      </Text>
      <Icon
        name="chevron-right"
        size={20}
        color={destructive ? "#DC9692" : "#8A9094"}
      />
    </Pressable>
  );
}
const styles = StyleSheet.create({
  subtitle: { fontSize: 13, lineHeight: 18 },
  identity: {
    padding: 16,
    flexDirection: "row",
    gap: 16,
    alignItems: "center",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#D6E8ED",
    backgroundColor: "#EBF4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    fontSize: 20,
    lineHeight: 26,
    fontFamily: fonts.bold,
    color: colors.primary,
  },
  identityInfo: { flex: 1, minWidth: 0 },
  identityHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 4,
    alignItems: "center",
  },
  name: {
    fontSize: 18,
    lineHeight: 26,
    fontFamily: fonts.semibold,
    flexShrink: 1,
  },
  customer: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.primary,
    fontFamily: fonts.medium,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  email: { fontSize: 14, lineHeight: 20, color: colors.muted, marginTop: 2 },
  detail: { paddingHorizontal: 16, paddingVertical: 14, gap: 2 },
  detailLabel: { fontSize: 14, lineHeight: 20, color: colors.muted },
  detailValue: { fontSize: 15, lineHeight: 22, fontFamily: fonts.semibold },
  divider: { borderTopWidth: 1, borderTopColor: "#F0F2F2" },
  action: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  actionLabel: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fonts.medium,
    flex: 1,
  },
  destructive: { color: "#BA322A", fontFamily: fonts.semibold },
  signOut: { marginTop: 8 },
  footer: {
    fontSize: 12,
    lineHeight: 18,
    color: "#8A9094",
    textAlign: "center",
    paddingTop: 16,
    paddingBottom: 8,
  },
});
