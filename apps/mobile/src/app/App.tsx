import Feather from "@expo/vector-icons/Feather";
import { IBMPlexSans_400Regular } from "@expo-google-fonts/ibm-plex-sans/400Regular";
import { IBMPlexSans_500Medium } from "@expo-google-fonts/ibm-plex-sans/500Medium";
import { IBMPlexSans_600SemiBold } from "@expo-google-fonts/ibm-plex-sans/600SemiBold";
import { IBMPlexSans_700Bold } from "@expo-google-fonts/ibm-plex-sans/700Bold";
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { LoginScreen } from "../features/accounts/LoginScreen";
import { HomeScreen } from "../features/home/HomeScreen";
import { previewAccount } from "../features/home/preview";
import { ApiClient, ApiError } from "../shared/api";
import { colors } from "../shared/theme";

export default function App() {
  const [api] = useState(
    () => new ApiClient(process.env.EXPO_PUBLIC_API_URL ?? ""),
  );
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (count, error) =>
              count < 1 &&
              (!(error instanceof ApiError) ||
                ![401, 403].includes(error.status)),
          },
          mutations: { retry: false },
        },
      }),
  );
  const session = useSyncExternalStore(api.subscribe, api.getSession);
  const [preview, setPreview] = useState(false);
  const [loaded, fontError] = useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexSans_700Bold,
    ...Feather.font,
  });

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) =>
      focusManager.setFocused(state === "active"),
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!session) queryClient.clear();
  }, [session, queryClient]);

  async function signOut() {
    if (preview) {
      setPreview(false);
      return;
    }
    queryClient.clear();
    try {
      await api.logout();
    } catch {
      Alert.alert(
        "Signed out on this phone",
        "Your supplier could not be reached to revoke the remote session. Sign in again when your connection is restored.",
      );
    }
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SafeAreaView style={styles.root}>
          <StatusBar style="dark" />
          {!loaded ? (
            <View style={styles.loading}>
              {fontError ? (
                <Text style={styles.fontError}>
                  Unable to load Aqours fonts. Close and reopen the app to try
                  again.
                </Text>
              ) : (
                <ActivityIndicator
                  accessibilityLabel="Loading Aqours"
                  color={colors.primary}
                />
              )}
            </View>
          ) : preview ||
            (session && !session.account.requiresPasswordChange) ? (
            <HomeScreen
              api={api}
              account={preview ? previewAccount : session!.account}
              preview={preview}
              onSignOut={() => {
                void signOut();
              }}
            />
          ) : (
            <LoginScreen
              key={session ? "change-password" : "login"}
              api={api}
              passwordChange={session?.account.requiresPasswordChange}
              onCancel={() => {
                void signOut();
              }}
              onPreview={() => setPreview(true)}
            />
          )}
        </SafeAreaView>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  fontError: { color: colors.ink, fontSize: 16, textAlign: "center" },
});
