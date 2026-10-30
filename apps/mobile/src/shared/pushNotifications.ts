import { isRunningInExpoGo } from "expo";
import { Platform } from "react-native";

export async function loadPushNotifications() {
  // Importing the package itself requires native modules absent from Expo Go.
  if (isRunningInExpoGo() || Platform.OS === "web") return null;
  try {
    return await import("expo-notifications");
  } catch {
    // In-app Updates remain available if the native integration is unavailable.
    return null;
  }
}
