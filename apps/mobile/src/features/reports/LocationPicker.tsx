import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../../shared/theme";
import { Button, Icon, Notice, Text } from "../../shared/ui";
import type { Coordinates } from "./form";
import { LeafletMap } from "./LeafletMap";
import { reportStyles as s } from "./styles";

export function LocationPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: Coordinates | null;
  onChange: (value: Coordinates) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [candidate, setCandidate] = useState(value);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [pinMapReady, setPinMapReady] = useState(false);
  const mounted = useRef(true);
  const operation = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      operation.current++;
    };
  }, []);
  async function locate() {
    const current = ++operation.current;
    setError("");
    setLocating(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!mounted.current || operation.current !== current) return;
      if (!permission.granted) {
        setError(
          "Location access is optional. Place a pin manually on the map instead.",
        );
        return;
      }
      const position = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("timeout")), 20000);
        }),
      ]);
      if (mounted.current && operation.current === current)
        onChange({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
    } catch {
      if (mounted.current && operation.current === current)
        setError(
          "Could not get your location. Check that location services are on, or place a pin manually.",
        );
    } finally {
      clearTimeout(timer);
      if (mounted.current && operation.current === current) setLocating(false);
    }
  }
  function placeManually() {
    operation.current++;
    setLocating(false);
    setError("");
    setCandidate(value);
    setPinMapReady(false);
    setOpen(true);
  }
  return (
    <View style={s.section}>
      <Text accessibilityRole="header" style={s.sectionTitle}>
        Problem location
      </Text>
      <Pressable
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={
          value
            ? "Change the selected problem location on the map"
            : "Choose the problem location on the map"
        }
        onPress={placeManually}
        style={styles.mapFrame}
      >
        <View style={styles.map}>
          <LeafletMap coordinates={value} />
        </View>
        <View style={styles.caption}>
          <Icon name="map-pin" size={16} />
          <Text style={s.small}>
            {value
              ? "Your selected report location · Tap to change"
              : "Tap the map to choose the problem location"}
          </Text>
        </View>
      </Pressable>
      <Button
        label="Use current location"
        secondary
        icon="crosshair"
        loading={locating}
        disabled={disabled}
        onPress={() => {
          void locate();
        }}
      />
      <Button
        label="Place pin manually"
        secondary
        icon="map-pin"
        disabled={disabled}
        onPress={placeManually}
      />
      <Text style={s.small}>
        Choose where the problem is. It can be different from your current
        location. Location access is optional.
      </Text>
      {value && <Text style={s.small}>Problem location selected.</Text>}
      {error ? <Notice>{error}</Notice> : null}
      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={s.page}>
          <View style={styles.modalHeader}>
            <Text accessibilityRole="header" style={s.sectionTitle}>
              Place your report pin
            </Text>
            <Text style={s.small}>
              Move and zoom the map, then tap where the problem is. Drag the pin
              to adjust it.
            </Text>
            <Button label="Cancel" secondary onPress={() => setOpen(false)} />
          </View>
          {open && (
            <View style={styles.fullMap}>
              <LeafletMap
                coordinates={value}
                interactive
                onSelect={setCandidate}
                onReadyChange={setPinMapReady}
              />
            </View>
          )}
          <View style={styles.modalHeader}>
            <Text style={s.small}>
              {candidate
                ? "Pin selected. Confirm this is where the problem is."
                : "Tap the map to place a pin."}
            </Text>
            <Button
              label="Use this location"
              icon="check"
              disabled={!candidate || !pinMapReady}
              onPress={() => {
                if (candidate && pinMapReady) {
                  onChange(candidate);
                  setOpen(false);
                }
              }}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  mapFrame: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: colors.white,
  },
  map: { height: 180, backgroundColor: colors.pale },
  caption: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    alignItems: "center",
    flexWrap: "wrap",
  },
  fullMap: { flex: 1 },
  modalHeader: {
    padding: 24,
    gap: 12,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
  },
});
