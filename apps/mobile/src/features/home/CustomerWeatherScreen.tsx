import { useQuery } from "@tanstack/react-query";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import type { ApiClient, CustomerSiteWeather } from "../../shared/api";
import { accountScreenStyles as s } from "../../shared/accountScreenStyles";
import { colors, fonts } from "../../shared/theme";
import { BackButton, Notice, Text } from "../../shared/ui";

export function CustomerWeatherScreen({
  api,
  onBack,
}: {
  api: ApiClient;
  onBack: () => void;
}) {
  const weather = useQuery({
    queryKey: ["customer-weather-sites"],
    queryFn: ({ signal }) =>
      api.request<{ items: CustomerSiteWeather[] }>(
        "/customer/weather/sites?pageSize=100",
        undefined,
        true,
        true,
        signal,
      ),
    staleTime: 30_000,
  });

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={weather.isRefetching}
          onRefresh={() => void weather.refetch()}
          tintColor={colors.primary}
        />
      }
    >
      <BackButton label="Back to Home" onPress={onBack} />
      <View>
        <Text accessibilityRole="header" style={s.title}>
          Weather outlook
        </Text>
        <Text style={s.subtitle}>
          Three-day forecast alongside recorded site supply.
        </Text>
      </View>
      {weather.isPending && <ActivityIndicator color={colors.primary} />}
      {weather.isError && <Notice>{weather.error.message}</Notice>}
      {weather.data?.items.map((site) => (
        <View key={site.id} style={[s.card, styles.site]}>
          <Text style={styles.name}>{site.name}</Text>
          <Text style={s.small}>
            Heat review threshold: {site.heatThresholdCelsius}°C · Supply: {site.latestSupplyStatus ?? "No update"}
          </Text>
          {(site.supplyMissing ||
            site.supplyStale ||
            site.forecastMissing ||
            site.forecastIncomplete ||
            site.forecastStale) && (
            <View style={styles.limitation}>
              <Text style={styles.limitationText}>
                Some information is missing or may be out of date.
              </Text>
            </View>
          )}
          {site.days.map((day) => (
            <View key={day.date} style={styles.day}>
              <Text style={styles.date}>
                {new Date(`${day.date}T12:00:00`).toLocaleDateString("en-PH", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </Text>
              <Text style={styles.temp}>
                {day.maximumTemperatureCelsius === null
                  ? "—"
                  : `${Math.round(day.maximumTemperatureCelsius)}°C`}
              </Text>
              <Text style={styles.state}>
                {day.warningState === "PotentialSupplyRisk"
                  ? "Potential supply risk"
                  : day.warningState === "NoWarning"
                    ? "No warning"
                    : "Limited data"}
              </Text>
            </View>
          ))}
          {site.limitations.map((limitation) => (
            <Text key={limitation} style={s.small}>
              {limitation}
            </Text>
          ))}
          <Text style={styles.attribution}>{site.provider.attribution}</Text>
        </View>
      ))}
      {weather.data?.items.length === 0 && (
        <View style={s.card}>
          <Text>No site forecasts are available yet.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 24,
    paddingBottom: 40,
    gap: 16,
    maxWidth: 560,
    width: "100%",
    alignSelf: "center",
  },
  site: { gap: 12 },
  name: { fontFamily: fonts.semibold, fontSize: 18 },
  day: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 8,
  },
  date: { flex: 1, color: colors.muted },
  temp: { width: 48, fontFamily: fonts.semibold },
  state: { width: 138, color: colors.primaryPressed, fontSize: 12, textAlign: "right" },
  limitation: { padding: 10, borderRadius: 8, backgroundColor: "#FFF7E8" },
  limitationText: { color: "#79520C", fontSize: 13 },
  attribution: { color: colors.muted, fontSize: 11 },
});
