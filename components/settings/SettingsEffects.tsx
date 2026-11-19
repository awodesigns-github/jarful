import { useEffect, useRef } from 'react';
import { useRouter, type Href } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useSettings } from '@/lib/data';
import { setHapticsEnabled } from '@/motion/haptics';
import { routeFromResponse, syncReminder } from './reminder';

// Foreground: show the banner quietly, no sound.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/** App-level side effects of the settings. Renders nothing. */
export function SettingsEffects() {
  const { haptics, reminderTime } = useSettings();
  const router = useRouter();
  const handled = useRef<string | null>(null);

  useEffect(() => setHapticsEnabled(haptics), [haptics]);

  // On start and whenever the setting changes, keep the schedule matching it. Never prompts.
  useEffect(() => {
    void syncReminder(reminderTime).catch(() => {});
  }, [reminderTime]);

  // Tapping the notification opens compose: cold start (last response) and warm app (listener).
  useEffect(() => {
    const open = (r: Notifications.NotificationResponse | null | undefined) => {
      const route = routeFromResponse(r);
      const id = r?.notification.request.identifier;
      if (!route || !id) return;
      const key = `${id}:${r?.notification.date}`;
      if (handled.current === key) return;
      handled.current = key;
      // On a cold start the navigator may not be ready yet: try now, then once more shortly.
      try {
        router.push(route as Href);
      } catch {
        setTimeout(() => router.push(route as Href), 400);
      }
    };
    void Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [router]);

  return null;
}
