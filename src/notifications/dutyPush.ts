import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { registerPushDevice, unregisterPushDevice } from '../api/push';
import i18n from '../i18n';
import { getAppClientPlatform } from '../utils/appClientMeta';

const DEVICE_ID_KEY = 'moni.push.deviceId';
const TOKEN_CACHE_KEY = 'moni.push.expoToken';
export const DUTY_NOTIFICATION_CHANNEL = 'duties';

export function dutyLocalNotificationId(instanceId: string | number): string {
  return `duty-${instanceId}`;
}

export async function ensureDutyNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(DUTY_NOTIFICATION_CHANNEL, {
    name: i18n.t('dutyChannelName'),
    description: i18n.t('dutyChannelDesc'),
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'default',
    enableVibrate: true,
  });
}

export function configureForegroundNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data as Record<string, unknown> | undefined;
      const instanceId = data?.instanceId ?? data?.dutyInstanceId;
      if (instanceId != null && String(instanceId)) {
        try {
          await Notifications.cancelScheduledNotificationAsync(
            dutyLocalNotificationId(String(instanceId)),
          );
        } catch {
          // ignore
        }
      }
      return {
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      };
    },
  });
}

async function getOrCreateDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing?.trim()) return existing.trim();
  const next = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  await AsyncStorage.setItem(DEVICE_ID_KEY, next);
  return next;
}

function resolveExpoProjectId(): string | undefined {
  return (
    Constants.easConfig?.projectId ??
    (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId
  );
}

export async function requestNotificationPermissions(): Promise<boolean> {
  await ensureDutyNotificationChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return true;
  }
  const asked = await Notifications.requestPermissionsAsync();
  return !!asked.granted || asked.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export async function syncPushRegistration(locale: 'en' | 'zh'): Promise<string | null> {
  try {
    const granted = await requestNotificationPermissions();
    if (!granted) return null;

    const projectId = resolveExpoProjectId();
    const tokenResult = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const expoPushToken = tokenResult.data?.trim();
    if (!expoPushToken) return null;

    await registerPushDevice({
      expoPushToken,
      platform: getAppClientPlatform(),
      deviceId: await getOrCreateDeviceId(),
      locale,
    });
    await AsyncStorage.setItem(TOKEN_CACHE_KEY, expoPushToken);
    return expoPushToken;
  } catch (e) {
    console.warn('push register skipped', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function clearPushRegistration(): Promise<void> {
  try {
    const cached = await AsyncStorage.getItem(TOKEN_CACHE_KEY);
    try {
      await unregisterPushDevice(cached);
    } catch {
      // best-effort
    }
    await AsyncStorage.removeItem(TOKEN_CACHE_KEY);
  } catch {
    // ignore
  }
}

export async function cancelDutyLocalNotification(instanceId: string | number): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(dutyLocalNotificationId(instanceId));
  } catch {
    // ignore
  }
}

export async function cancelAllDutyLocalNotifications(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => n.identifier.startsWith('duty-'))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch {
    // ignore
  }
}

function buildDutyBody(lang: 'en' | 'zh', triggerType: string, title: string): string {
  const t = title.trim() || (lang === 'zh' ? '任务' : 'Duty');
  if (triggerType === 'clock_in') {
    return i18n.t('dutyNotifyBodyClockIn', { title: t, lng: lang });
  }
  if (triggerType === 'clock_out') {
    return i18n.t('dutyNotifyBodyClockOut', { title: t, lng: lang });
  }
  return i18n.t('dutyNotifyBodyRecurring', { title: t, lng: lang });
}

function parseTriggerDate(iso?: string): Date | null {
  if (!iso?.trim()) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 按今日 duty 列表预约本地通知；与服务端推送用同一 instanceId 去重。 */
export async function syncDutyLocalNotifications(
  duties: Array<{
    id: string;
    title: string;
    triggerType: string;
    status: string;
    windowStart?: string;
    windowEnd?: string;
    dueAt?: string;
  }>,
  lang: 'en' | 'zh',
): Promise<void> {
  await ensureDutyNotificationChannel();
  await cancelAllDutyLocalNotifications();

  const now = Date.now();
  const title = i18n.t('dutyNotifyTitle', { lng: lang });

  for (const duty of duties) {
    if (!duty.id || duty.status !== 'pending') continue;

    let when: Date | null = null;
    if (duty.triggerType === 'recurring') {
      when = parseTriggerDate(duty.dueAt) ?? parseTriggerDate(duty.windowStart);
    } else {
      when = parseTriggerDate(duty.windowStart) ?? parseTriggerDate(duty.dueAt);
    }
    if (!when) continue;

    const end = parseTriggerDate(duty.windowEnd);
    if (end && end.getTime() <= now) continue;
    if (when.getTime() <= now + 2000) continue;

    try {
      await Notifications.scheduleNotificationAsync({
        identifier: dutyLocalNotificationId(duty.id),
        content: {
          title,
          body: buildDutyBody(lang, duty.triggerType, duty.title),
          sound: 'default',
          data: {
            type: 'duty_due',
            instanceId: duty.id,
            dutyInstanceId: duty.id,
            triggerType: duty.triggerType,
          },
          ...(Platform.OS === 'android' ? { channelId: DUTY_NOTIFICATION_CHANNEL } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: when,
          channelId: DUTY_NOTIFICATION_CHANNEL,
        },
      });
    } catch (e) {
      console.warn('schedule duty local failed', duty.id, e instanceof Error ? e.message : e);
    }
  }
}
