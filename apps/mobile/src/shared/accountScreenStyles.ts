import { StyleSheet } from "react-native";
import { colors, fonts } from "./theme";

// Dimensions and colors from the 390px Stitch Profile/Updates exports.
export const accountScreenStyles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.ground },
  content: {
    padding: 24,
    paddingBottom: 44,
    gap: 24,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontFamily: fonts.bold,
    letterSpacing: -0.7,
  },
  subtitle: { fontSize: 14, lineHeight: 20, color: colors.muted, marginTop: 4 },
  section: { gap: 8 },
  caption: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.semibold,
    color: colors.muted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  pressed: { opacity: 0.7 },
  small: { fontSize: 12, lineHeight: 18, color: colors.muted },
});
