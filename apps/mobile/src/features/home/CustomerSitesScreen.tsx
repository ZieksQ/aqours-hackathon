import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import * as Location from "expo-location";
import type { ApiClient, CustomerSupplySite } from "../../shared/api";
import { accountScreenStyles as s } from "../../shared/accountScreenStyles";
import { colors, fonts } from "../../shared/theme";
import { BackButton, Button, Notice, Text } from "../../shared/ui";
import type { Coordinates } from "../reports/form";
import { LeafletMap } from "../reports/LeafletMap";

export function CustomerSitesScreen({
  api,
  onBack,
}: {
  api: ApiClient;
  onBack: () => void;
}) {
  const sites = useQuery({
    queryKey: ["customer-sites"],
    queryFn: ({ signal }) =>
      api.request<{ items: CustomerSupplySite[] }>(
        "/customer/supply-sites?pageSize=100",
        undefined,
        true,
        true,
        signal,
      ),
    staleTime: 30_000,
  });
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const items = sites.data?.items ?? [];

  async function showCurrentLocation() {
    setLocationError(null);
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (permission.status !== "granted") {
        setLocationError(
          "Location permission is off. Supplier sites are still available on the map.",
        );
        return;
      }
      const point = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLocation({
        latitude: point.coords.latitude,
        longitude: point.coords.longitude,
      });
    } catch {
      setLocationError(
        "Could not get your location. Check that location services are on and try again.",
      );
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={sites.isRefetching}
          onRefresh={() => void sites.refetch()}
          tintColor={colors.primary}
        />
      }
    >
      <BackButton label="Back to Home" onPress={onBack} />
      <View>
        <Text accessibilityRole="header" style={s.title}>
          Supplier sites
        </Text>
        <Text style={s.subtitle}>
          Manual supply status reported by your supplier.
        </Text>
      </View>
      {sites.isPending && <ActivityIndicator color={colors.primary} />}
      {sites.isError && <Notice>{sites.error.message}</Notice>}
      {sites.isSuccess && items.length > 0 && (
        <View style={styles.map}>
          <LeafletMap
            coordinates={location}
            coordinateLabel="Your location"
            readOnlyInteractive
            sites={items.map((site) => ({
              latitude: site.latitude,
              longitude: site.longitude,
              name: site.name,
              status: site.latestSupply?.status,
              address: `${site.address.details}, ${site.address.barangayName}, ${site.address.cityMunicipalityName}`,
              updatedAt: site.latestSupply?.updatedAt
                ? new Date(site.latestSupply.updatedAt).toLocaleString("en-PH", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : null,
            }))}
          />
        </View>
      )}
      {sites.isSuccess && items.length > 0 && (
        <Button
          label={location ? "Refresh my location" : "Show my location"}
          icon="crosshair"
          secondary
          onPress={() => void showCurrentLocation()}
        />
      )}
      {locationError && <Notice>{locationError}</Notice>}
      {sites.isSuccess && items.length === 0 && (
        <View style={s.card}>
          <Text>No supplier sites are available yet.</Text>
        </View>
      )}
      {items.map((site) => (
        <View key={site.id} style={[s.card, styles.site]}>
          <Text style={styles.siteName}>{site.name}</Text>
          <Text style={s.subtitle}>
            {site.address.details}, {site.address.barangayName},{" "}
            {site.address.cityMunicipalityName}
          </Text>
          <View style={styles.row}>
            <Text
              style={[
                styles.status,
                site.latestSupply?.status === "Low" && styles.low,
                site.latestSupply?.status === "Unavailable" &&
                  styles.unavailable,
              ]}
            >
              {site.latestSupply?.status ?? "No update"}
            </Text>
            <Text style={s.small}>
              {site.latestSupply
                ? `Updated ${new Date(site.latestSupply.updatedAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}`
                : "No manual supply reading recorded"}
            </Text>
          </View>
        </View>
      ))}
      <Text style={s.small}>
        Supply values are manually recorded, not live sensor readings.
      </Text>
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
  map: {
    height: 250,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  site: { gap: 6 },
  siteName: { fontFamily: fonts.semibold, fontSize: 17 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 6,
  },
  status: {
    color: colors.primaryPressed,
    backgroundColor: colors.pale,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontFamily: fonts.semibold,
  },
  low: { color: "#79520C", backgroundColor: "#FFF2D9" },
  unavailable: { color: "#9C2924", backgroundColor: "#FFF0EE" },
});
