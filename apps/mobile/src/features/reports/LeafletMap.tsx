import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { colors } from "../../shared/theme";
import { Button, Notice, Text } from "../../shared/ui";
import type { Coordinates } from "./form";
import {
  createMapHtml,
  mapAttributionLinks,
  mapDocumentOrigin,
  parseMapMessage,
} from "./leaflet-map";

export function LeafletMap({
  coordinates,
  interactive = false,
  onSelect,
  onReadyChange,
  sites,
  readOnlyInteractive = false,
  coordinateLabel,
}: {
  coordinates: Coordinates | null;
  interactive?: boolean;
  onSelect?: (coordinates: Coordinates | null) => void;
  onReadyChange?: (ready: boolean) => void;
  sites?: {
    latitude: number;
    longitude: number;
    name: string;
    status?: string | null;
    address?: string;
    updatedAt?: string | null;
  }[];
  readOnlyInteractive?: boolean;
  coordinateLabel?: string;
}) {
  const apiKey = process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY?.trim() ?? "";
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const source = useMemo(
    () => ({
      html: createMapHtml({ apiKey, coordinates, interactive, gestures: interactive || readOnlyInteractive, sites, coordinateLabel }),
      baseUrl: mapDocumentOrigin,
    }),
    [apiKey, coordinates, interactive, readOnlyInteractive, sites, coordinateLabel],
  );
  useEffect(() => {
    setStatus("loading");
    onReadyChange?.(false);
  }, [source, attempt, onReadyChange]);
  useEffect(() => {
    if (status !== "loading") return;
    const timeout = setTimeout(() => {
      setStatus("error");
      onReadyChange?.(false);
    }, 20000);
    return () => clearTimeout(timeout);
  }, [status, source, attempt, onReadyChange]);
  function failed() {
    setStatus("error");
    onReadyChange?.(false);
  }
  if (!apiKey)
    return (
      <View style={styles.unavailable}>
        <Notice>
          {__DEV__
            ? "Set EXPO_PUBLIC_GEOAPIFY_API_KEY in apps/mobile/.env.local and restart Expo to enable the map."
            : "The map is unavailable. You can still select your current location with GPS."}
        </Notice>
      </View>
    );
  return (
    <View style={styles.root}>
      <WebView
        key={attempt}
        pointerEvents={interactive || readOnlyInteractive ? "auto" : "none"}
        source={source}
        style={styles.map}
        javaScriptEnabled
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        originWhitelist={["*"]}
        mixedContentMode="never"
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        sharedCookiesEnabled={false}
        thirdPartyCookiesEnabled={false}
        javaScriptCanOpenWindowsAutomatically={false}
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={({ url }) => {
          if (url === "about:blank" || url === mapDocumentOrigin) return true;
          if (mapAttributionLinks.includes(url))
            void Linking.openURL(url).catch(() => {});
          return false;
        }}
        onError={failed}
        onHttpError={failed}
        onContentProcessDidTerminate={failed}
        onRenderProcessGone={failed}
        onMessage={({ nativeEvent }) => {
          const message = parseMapMessage(nativeEvent.data);
          if (!message) return;
          if (message.type === "select") {
            if (interactive && status === "loaded")
              onSelect?.({
                latitude: message.latitude,
                longitude: message.longitude,
              });
          } else {
            setStatus(message.type);
            onReadyChange?.(message.type === "loaded");
          }
        }}
      />
      {status === "loading" && (
        <View
          pointerEvents="none"
          style={styles.loading}
          accessibilityLiveRegion="polite"
        >
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.small}>Loading map…</Text>
        </View>
      )}
      {status === "error" && (
        <View style={styles.error}>
          <Notice>
            Could not load the map. Check your internet connection and try
            again.
          </Notice>
          <Button
            label="Retry map"
            secondary
            onPress={() => {
              if (interactive) onSelect?.(coordinates);
              setAttempt((current) => current + 1);
            }}
          />
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  map: { flex: 1, backgroundColor: colors.ground },
  loading: {
    position: "absolute",
    top: 12,
    alignSelf: "center",
    padding: 10,
    gap: 6,
    alignItems: "center",
    borderRadius: 8,
    backgroundColor: colors.white,
  },
  small: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  error: {
    position: "absolute",
    bottom: 8,
    left: 8,
    right: 8,
    gap: 8,
    backgroundColor: colors.white,
    padding: 8,
    borderRadius: 12,
  },
  unavailable: { flex: 1, justifyContent: "center", padding: 12 },
});
