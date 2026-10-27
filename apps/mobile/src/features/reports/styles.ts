import { StyleSheet } from "react-native";
import { colors, fonts } from "../../shared/theme";

export const reportStyles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.ground },
  content: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    padding: 24,
    paddingBottom: 32,
    gap: 24,
  },
  title: {
    fontSize: 30,
    lineHeight: 38,
    fontFamily: fonts.semibold,
    letterSpacing: -0.6,
  },
  section: { gap: 12 },
  sectionTitle: { fontSize: 18, lineHeight: 26, fontFamily: fonts.medium },
  muted: { color: colors.muted },
  small: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  error: { color: colors.error, fontSize: 14, lineHeight: 20 },
  status: {
    color: colors.primaryPressed,
    fontFamily: fonts.semibold,
    backgroundColor: colors.pale,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
    lineHeight: 18,
  },
  pressed: { opacity: 0.65 },
});
