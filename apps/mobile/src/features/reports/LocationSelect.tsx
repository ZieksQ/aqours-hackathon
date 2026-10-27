import { useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, fonts } from "../../shared/theme";
import { Button, Field, Icon, Text } from "../../shared/ui";
import { reportStyles as s } from "./styles";

export function LocationSelect({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  options: { psgc_code: string; name: string }[];
  value?: string;
  onChange: (code: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = options.find((option) => option.psgc_code === value);
  const filtered = options.filter((option) =>
    option.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.name ?? "Select"}`}
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        style={({ pressed }) => [styles.select, pressed && s.pressed]}
        onPress={() => {
          setSearch("");
          setOpen(true);
        }}
      >
        <Text style={[styles.value, !selected && s.muted]}>
          {selected?.name ?? `Select ${label.toLowerCase()}`}
        </Text>
        <Icon name="chevron-down" color={colors.muted} size={20} />
      </Pressable>
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={s.page}>
          <View style={styles.modalHeader}>
            <Text accessibilityRole="header" style={s.sectionTitle}>
              Select {label.toLowerCase()}
            </Text>
            <Button label="Done" secondary onPress={() => setOpen(false)} />
            <Field
              nativeID={`search-${label}`}
              label={`Search ${label.toLowerCase()}`}
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name"
            />
          </View>
          <FlatList
            keyboardShouldPersistTaps="handled"
            data={filtered}
            keyExtractor={(item) => item.psgc_code}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={s.muted}>
                No matching locations. Try another name.
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: item.psgc_code === value }}
                onPress={() => {
                  onChange(item.psgc_code);
                  setOpen(false);
                }}
                style={({ pressed }) => [styles.option, pressed && s.pressed]}
              >
                <Text style={styles.value}>{item.name}</Text>
                {item.psgc_code === value && <Icon name="check" size={20} />}
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 14, lineHeight: 20, fontFamily: fonts.medium },
  select: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.white,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  value: { flex: 1, fontSize: 16, lineHeight: 24 },
  modalHeader: { padding: 24, gap: 16 },
  list: { paddingHorizontal: 24, paddingBottom: 24 },
  option: {
    minHeight: 52,
    paddingVertical: 14,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
