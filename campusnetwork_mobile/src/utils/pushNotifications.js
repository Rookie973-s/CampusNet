/**
 * Native Push Notification Manager (Expo Notifications + Backend Device Token Sync)
 * - Requests permission safely on physical Android/iOS devices
 * - Configures high-priority Android notification channel
 * - Registers Expo push token with Django /api/notifications/device-token/
 * - Handles foreground presentation & tap-to-open navigation
 */
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { notificationsApi } from "../api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotificationsAsync() {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "CampusNetwork Updates",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 220, 150, 220],
        lightColor: "#2563EB",
      });
    }

    if (!Device.isDevice) {
      return null;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") {
      return null;
    }

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ||
      Constants?.easConfig?.projectId;

    const tokenRes = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();

    const token = tokenRes?.data;
    if (token) {
      await notificationsApi.registerDeviceToken(token, Platform.OS).catch(() => {});
    }
    return token || null;
  } catch {
    return null;
  }
}

export function subscribeNotificationResponses(onOpenPayload) {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response?.notification?.request?.content?.data || {};
    onOpenPayload && onOpenPayload(data);
  });
  return () => sub.remove();
}
