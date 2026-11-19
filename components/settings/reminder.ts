import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export const REMINDER_ID = 'daily-reminder';
export const REMINDER_CHANNEL = 'daily-reminder';
export const REMINDER_ROUTE = '/compose';
export const REMINDER_COPY = { title: 'Jarful', body: 'Anything good today? Your jar is here when you are.' };

export type PermissionResult = 'granted' | 'denied';

export function parseTime(t: string): { hour: number; minute: number } {
  const [h, m] = t.split(':').map(Number);
  return { hour: h, minute: m };
}
export const formatTime = (hour: number, minute: number) => `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

/** One quiet channel, created before the permission prompt (Android 13+ needs it first). */
async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
    name: 'Daily reminder',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/** Current permission without ever prompting. */
export async function hasPermission(): Promise<boolean> {
  const p = await Notifications.getPermissionsAsync();
  return p.granted || p.status === 'granted';
}

/** Asks only when the user turns the reminder on. */
export async function requestPermission(): Promise<PermissionResult> {
  await ensureChannel();
  if (await hasPermission()) return 'granted';
  const p = await Notifications.requestPermissionsAsync();
  return p.granted || p.status === 'granted' ? 'granted' : 'denied';
}

export async function cancelReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID);
}

/** Replace any existing reminder with one repeating daily at `time` ("HH:mm"). */
export async function scheduleReminder(time: string): Promise<void> {
  const { hour, minute } = parseTime(time);
  await ensureChannel();
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID);
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: { ...REMINDER_COPY, data: { route: REMINDER_ROUTE } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: REMINDER_CHANNEL },
  });
}

/** Turn on: ask for permission now, then schedule. Denied schedules nothing. */
export async function enableReminder(time: string): Promise<PermissionResult> {
  const result = await requestPermission();
  if (result === 'granted') await scheduleReminder(time);
  return result;
}

/** Time change while on: reschedule (permission was granted when it was turned on). */
export const rescheduleReminder = scheduleReminder;

/**
 * On app start: make the scheduled notification match the setting. Never prompts.
 * Off, or permission gone: nothing scheduled. On: exactly one at the chosen time.
 */
export async function syncReminder(time: string | null): Promise<void> {
  if (time === null || !(await hasPermission())) {
    await cancelReminder();
    return;
  }
  const { hour, minute } = parseTime(time);
  const all = await Notifications.getAllScheduledNotificationsAsync();
  const mine = all.filter((n) => n.identifier === REMINDER_ID);
  const ok =
    mine.length === 1 &&
    (mine[0].trigger as { hour?: number; minute?: number } | null)?.hour === hour &&
    (mine[0].trigger as { minute?: number } | null)?.minute === minute;
  if (!ok) await scheduleReminder(time);
}

/** Route from a tapped notification, if it is ours. */
export function routeFromResponse(r: Notifications.NotificationResponse | null | undefined): string | null {
  const route = r?.notification.request.content.data?.route;
  return typeof route === 'string' ? route : null;
}
