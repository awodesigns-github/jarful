/// <reference types="jest" />
import { Linking } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import Settings from '@/app/settings';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true, replace: jest.fn(), push: mockPush }),
}));
const mockEnable = jest.fn();
const mockCancel = jest.fn().mockResolvedValue(undefined);
const mockResched = jest.fn().mockResolvedValue(undefined);
jest.mock('@/components/settings/reminder', () => ({
  ...jest.requireActual('@/components/settings/reminder'),
  enableReminder: (...a: unknown[]) => mockEnable(...a),
  cancelReminder: () => mockCancel(),
  rescheduleReminder: (...a: unknown[]) => mockResched(...a),
}));
const { mockSettings, mockUpdate } = require('./setup');
const metrics = { frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SafeAreaProvider initialMetrics={metrics}>
    <ThemeProvider>{children}</ThemeProvider>
  </SafeAreaProvider>
);

describe('Settings screen (US-29 to US-33)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('every row has a label and a role', async () => {
    mockSettings.current.reminderTime = '21:00';
    const { getByTestId } = await render(<Settings />, { wrapper });
    expect(getByTestId('toggle-reminder').props.accessibilityRole).toBe('switch');
    expect(getByTestId('toggle-reminder').props.accessibilityState).toEqual({ checked: true });
    expect(getByTestId('toggle-haptics').props.accessibilityRole).toBe('switch');
    expect(getByTestId('theme-dark').props.accessibilityRole).toBe('radio');
    expect(getByTestId('motion-on').props.accessibilityLabel).toBe('Reduced motion, On');
    expect(getByTestId('row-account').props.accessibilityLabel).toMatch(/Account/);
    expect(getByTestId('settings-back').props.accessibilityLabel).toBe('Back');
  });

  it('theme and reduced motion write the setting', async () => {
    const { getByTestId } = await render(<Settings />, { wrapper });
    await fireEvent.press(getByTestId('theme-dark'));
    expect(mockUpdate).toHaveBeenCalledWith({ theme: 'dark' });
    await fireEvent.press(getByTestId('motion-off'));
    expect(mockUpdate).toHaveBeenCalledWith({ reducedMotion: 'off' });
    expect(getByTestId('theme-system').props.accessibilityState).toEqual({ selected: true });
  });

  it('haptics toggles', async () => {
    const { getByTestId } = await render(<Settings />, { wrapper });
    await fireEvent.press(getByTestId('toggle-haptics'));
    expect(mockUpdate).toHaveBeenCalledWith({ haptics: false });
  });

  it('turning the reminder on asks for permission then saves a default time', async () => {
    mockEnable.mockResolvedValue('granted');
    const { getByTestId } = await render(<Settings />, { wrapper });
    await fireEvent.press(getByTestId('toggle-reminder'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({ reminderTime: '21:00' }));
    expect(mockEnable).toHaveBeenCalledWith('21:00');
  });

  it('denied: calm note with a way to system settings, nothing saved', async () => {
    mockEnable.mockResolvedValue('denied');
    const spy = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    const { getByTestId, queryByTestId } = await render(<Settings />, { wrapper });
    expect(queryByTestId('reminder-denied')).toBeNull();
    await fireEvent.press(getByTestId('toggle-reminder'));
    await waitFor(() => getByTestId('reminder-denied'));
    expect(mockUpdate).not.toHaveBeenCalled();
    await fireEvent.press(getByTestId('reminder-open-settings'));
    expect(spy).toHaveBeenCalled();
  });

  it('turning it off clears the time and cancels', async () => {
    mockSettings.current.reminderTime = '21:00';
    const { getByTestId } = await render(<Settings />, { wrapper });
    await fireEvent.press(getByTestId('toggle-reminder'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({ reminderTime: null }));
    expect(mockCancel).toHaveBeenCalled();
  });

  it('changing the time saves and reschedules', async () => {
    mockSettings.current.reminderTime = '21:00';
    const { getByTestId } = await render(<Settings />, { wrapper });
    await fireEvent.press(getByTestId('reminder-time-row'));
    await fireEvent.press(getByTestId('hour-up'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({ reminderTime: '22:00' }));
    expect(mockResched).toHaveBeenCalledWith('22:00');
    await fireEvent.press(getByTestId('minute-down'));
    await waitFor(() => expect(mockResched).toHaveBeenCalledWith('21:55'));
  });

  it('account row opens the account placeholder', async () => {
    const { getByTestId } = await render(<Settings />, { wrapper });
    await fireEvent.press(getByTestId('row-account'));
    expect(mockPush).toHaveBeenCalledWith('/account');
  });
});
