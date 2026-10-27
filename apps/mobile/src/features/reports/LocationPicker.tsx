import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../../shared/theme";
import { Button, Field, Icon, Notice, Text } from "../../shared/ui";
import { validCoordinates, type Coordinates } from "./form";
import { reportStyles as s } from "./styles";

const philippines = {
  latitude: 12.5,
  longitude: 122,
  latitudeDelta: 13,
  longitudeDelta: 13,
};
function regionFor(value: Coordinates | null) {
  return value
    ? { ...value, latitudeDelta: 0.008, longitudeDelta: 0.008 }
    : philippines;
}
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
  const [manual, setManual] = useState(false);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
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
          "Location access is optional. Place a pin manually or enter coordinates below.",
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
        <View pointerEvents="none" style={styles.map}>
          <MapView
            key={value ? `${value.latitude},${value.longitude}` : "unselected"}
            style={StyleSheet.absoluteFill}
            initialRegion={regionFor(value)}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            toolbarEnabled={false}
            showsPointsOfInterests={false}
          >
            {value && (
              <Marker
                coordinate={value}
                pinColor={colors.primary}
                title="Report location"
              />
            )}
          </MapView>
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
      {value && (
        <Text selectable style={s.small}>
          Selected: {value.latitude.toFixed(6)}, {value.longitude.toFixed(6)}
        </Text>
      )}
      {error ? <Notice>{error}</Notice> : null}
      <Button
        label={manual ? "Hide coordinate entry" : "Enter coordinates instead"}
        secondary
        disabled={disabled}
        onPress={() => {
          setManual(!manual);
          setLatitude(value?.latitude.toString() ?? "");
          setLongitude(value?.longitude.toString() ?? "");
        }}
      />
      {manual && (
        <View style={s.section}>
          <Field
            nativeID="latitude"
            label="Latitude (−90 to 90)"
            keyboardType="numbers-and-punctuation"
            value={latitude}
            onChangeText={setLatitude}
            editable={!disabled}
            placeholder="e.g. 14.6760"
          />
          <Field
            nativeID="longitude"
            label="Longitude (−180 to 180)"
            keyboardType="numbers-and-punctuation"
            value={longitude}
            onChangeText={setLongitude}
            editable={!disabled}
            placeholder="e.g. 121.0437"
          />
          <Button
            label="Use these coordinates"
            secondary
            disabled={disabled}
            onPress={() => {
              const point = {
                latitude: Number(latitude.trim()),
                longitude: Number(longitude.trim()),
              };
              if (
                !latitude.trim() ||
                !longitude.trim() ||
                !validCoordinates(point)
              ) {
                setError(
                  "Enter a valid latitude (−90 to 90) and longitude (−180 to 180).",
                );
                return;
              }
              operation.current++;
              setLocating(false);
              setError("");
              onChange(point);
              setManual(false);
            }}
          />
        </View>
      )}
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
            <MapView
              style={styles.fullMap}
              initialRegion={regionFor(value)}
              onPress={(event) => setCandidate(event.nativeEvent.coordinate)}
              showsPointsOfInterests={false}
              toolbarEnabled={false}
            >
              {candidate && (
                <Marker
                  coordinate={candidate}
                  draggable
                  pinColor={colors.primary}
                  title="Report location"
                  onDragEnd={(event) =>
                    setCandidate(event.nativeEvent.coordinate)
                  }
                />
              )}
            </MapView>
          )}
          <View style={styles.modalHeader}>
            <Text style={s.small}>
              {candidate
                ? `${candidate.latitude.toFixed(6)}, ${candidate.longitude.toFixed(6)}`
                : "Tap the map to place a pin."}
            </Text>
            <Button
              label="Use this location"
              icon="check"
              disabled={!candidate}
              onPress={() => {
                if (candidate) {
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
