/// <reference types="jest" />
import { Platform } from 'react-native';
import * as N from 'expo-notifications';
import { cancelReminder, enableReminder, REMINDER_ID, rescheduleReminder, routeFromResponse, syncReminder } from '@/components/settings/reminder';

const m = N as unknown as Record<string, jest.Mock>;
const perm = (granted: boolean) => ({ granted, status: granted ? 'granted' : 'denied' });

beforeEach(() => {
  jest.clearAllMocks();
  m.getPermissionsAsync.mockResolvedValue(perm(false));
  m.requestPermissionsAsync.mockResolvedValue(perm(true));
  m.getAllScheduledNotificationsAsync.mockResolvedValue([]);
});

describe('daily reminder scheduling (US-04, US-29)', () => {
  it('asks for permission when turned on, then schedules one daily notification', async () => {
    expect(await enableReminder('21:00')).toBe('granted');
    expect(m.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(m.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const arg = m.scheduleNotificationAsync.mock.calls[0][0];
    expect(arg.identifier).toBe(REMINDER_ID);
    expect(arg.trigger).toMatchObject({ type: 'daily', hour: 21, minute: 0, channelId: 'daily-reminder' });
    expect(arg.content.data.route).toBe('/compose');
    expect(arg.content.body).not.toMatch(/streak|miss|forgot/i);
  });

  it('creates one quiet "Daily reminder" channel on Android', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await enableReminder('21:00');
    expect(m.setNotificationChannelAsync).toHaveBeenCalledWith('daily-reminder', expect.objectContaining({ name: 'Daily reminder', importance: 3 }));
  });

  it('does not prompt again when permission is already granted', async () => {
    m.getPermissionsAsync.mockResolvedValue(perm(true));
    await enableReminder('08:30');
    expect(m.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(m.scheduleNotificationAsync).toHaveBeenCalled();
  });

  it('permission denied: schedules nothing', async () => {
    m.requestPermissionsAsync.mockResolvedValue(perm(false));
    expect(await enableReminder('21:00')).toBe('denied');
    expect(m.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('reschedules on a time change: cancel the old, schedule the new', async () => {
    await rescheduleReminder('07:05');
    expect(m.cancelScheduledNotificationAsync).toHaveBeenCalledWith(REMINDER_ID);
    expect(m.scheduleNotificationAsync.mock.calls[0][0].trigger).toMatchObject({ hour: 7, minute: 5 });
  });

  it('cancels when turned off', async () => {
    await cancelReminder();
    expect(m.cancelScheduledNotificationAsync).toHaveBeenCalledWith(REMINDER_ID);
    expect(m.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

describe('syncReminder on app start', () => {
  it('off: cancels', async () => {
    await syncReminder(null);
    expect(m.cancelScheduledNotificationAsync).toHaveBeenCalled();
    expect(m.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
  it('on but permission missing: cancels, never prompts', async () => {
    await syncReminder('21:00');
    expect(m.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(m.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
  it('on and missing: schedules', async () => {
    m.getPermissionsAsync.mockResolvedValue(perm(true));
    await syncReminder('21:00');
    expect(m.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });
  it('on and already matching: leaves it alone', async () => {
    m.getPermissionsAsync.mockResolvedValue(perm(true));
    m.getAllScheduledNotificationsAsync.mockResolvedValue([{ identifier: REMINDER_ID, trigger: { hour: 21, minute: 0 } }]);
    await syncReminder('21:00');
    expect(m.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
  it('on and drifted: reschedules', async () => {
    m.getPermissionsAsync.mockResolvedValue(perm(true));
    m.getAllScheduledNotificationsAsync.mockResolvedValue([{ identifier: REMINDER_ID, trigger: { hour: 9, minute: 0 } }]);
    await syncReminder('21:00');
    expect(m.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });
});

describe('tapping the notification', () => {
  it('routes to compose', () => {
    const r = { notification: { request: { content: { data: { route: '/compose' } } } } } as never;
    expect(routeFromResponse(r)).toBe('/compose');
    expect(routeFromResponse(null)).toBeNull();
  });
});
