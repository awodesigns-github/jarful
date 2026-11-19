/// <reference types="jest" />
import { fireEvent, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '@/theme';
import { darkTheme, lightTheme } from '@/theme/tokens';
import Home from '@/app/index';
import Compose from '@/app/compose';
import { dropCoordinator } from '@/motion/dropCoordinator';
import Archive from '@/app/archive';

const metrics = {
  frame: { x: 0, y: 0, width: 360, height: 800 },
  insets: { top: 24, left: 0, right: 0, bottom: 0 },
};

function Wrapped({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
  );
}

const mockBack = jest.fn();
jest.mock('expo-router', () => {
  const actual = jest.requireActual('expo-router');
  return { ...actual, useRouter: () => ({ back: mockBack, canGoBack: () => true, replace: jest.fn(), push: jest.fn() }) };
});

describe('placeholder screens (US-13 shell)', () => {
  it('home has a header, a jar with a label, and an add button', async () => {
    const { getByTestId, getByRole } = await render(<Home />, { wrapper: Wrapped });
    expect(getByRole('header')).toHaveTextContent('Jarful');
    expect(getByTestId('home-jar').props.accessibilityLabel).toMatch(/Your jar/);
    expect(getByTestId('home-compose').props.accessibilityLabel).toBe('Add a note');
    for (const id of ['archive', 'settings']) {
      expect(getByTestId(`link-${id}`).props.accessibilityRole).toBe('link');
    }
  });
});

function Probe() {
  const { theme, scheme, mode } = useTheme();
  return (
    <>
      <Text testID="scheme">{scheme}</Text>
      <Text testID="mode">{mode}</Text>
      <Text testID="bg">{theme.colors.bgBase}</Text>
    </>
  );
}

describe('theme light/dark (US-16)', () => {
  const mockScheme = (v: 'light' | 'dark' | null) =>
    jest.spyOn(require('react-native/Libraries/Utilities/useColorScheme'), 'default').mockReturnValue(v);
  afterEach(() => jest.restoreAllMocks());

  it('defaults to system mode and uses light tokens when the phone is light', async () => {
    mockScheme('light');
    const { getByTestId } = await render(<Probe />, { wrapper: ThemeProvider });
    expect(getByTestId('mode')).toHaveTextContent('system');
    expect(getByTestId('scheme')).toHaveTextContent('light');
    expect(getByTestId('bg')).toHaveTextContent(lightTheme.colors.bgBase);
  });

  it('uses dark tokens when the phone is dark', async () => {
    mockScheme('dark');
    const { getByTestId } = await render(<Probe />, { wrapper: ThemeProvider });
    expect(getByTestId('scheme')).toHaveTextContent('dark');
    expect(getByTestId('bg')).toHaveTextContent(darkTheme.colors.bgBase);
  });

  it('switches to dark tokens live when the phone changes, without remounting', async () => {
    const spy = mockScheme('light');
    const { getByTestId, rerender } = await render(<Probe />, { wrapper: ThemeProvider });
    expect(getByTestId('scheme')).toHaveTextContent('light');
    spy.mockReturnValue('dark');
    await rerender(<Probe />);
    expect(getByTestId('scheme')).toHaveTextContent('dark');
    expect(getByTestId('bg')).toHaveTextContent(darkTheme.colors.bgBase);
  });

  it('an explicit mode overrides the phone setting', async () => {
    mockScheme('light');
    require('./setup').mockSettings.current.theme = 'dark';
    const { getByTestId } = await render(<Probe />, { wrapper: ThemeProvider });
    expect(getByTestId('mode')).toHaveTextContent('dark');
    expect(getByTestId('scheme')).toHaveTextContent('dark');
  });

  it('light and dark tokens differ', async () => {
    expect(lightTheme.colors.bgBase).not.toBe(darkTheme.colors.bgBase);
    expect(lightTheme.colors.textPrimary).not.toBe(darkTheme.colors.textPrimary);
  });

  it('useTheme throws outside a provider', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(render(<Probe />)).rejects.toThrow();
  });
});

describe('home jar and compose (M2 phase 2a)', () => {
  const { mockJar, mockPending, mockAdd, mockDraft } = require('./setup');
  beforeEach(() => {
    mockJar.current = { jarId: 'j', capacity: 30, noteCount: 15 };
    mockPending.current = 0;
    mockAdd.mockReset();
    mockDraft.text = '';
    mockDraft.setText.mockReset();
    mockDraft.clear.mockReset();
  });

  it('labels the jar by fill without showing a count', async () => {
    const { getByTestId, queryByText } = await render(<Home />, { wrapper: Wrapped });
    expect(getByTestId('home-jar').props.accessibilityLabel).toBe('Your jar, about half full');
    expect(queryByText(/15/)).toBeNull();
  });

  it('counts unsent notes towards the fill', async () => {
    mockPending.current = 15;
    const { getByTestId } = await render(<Home />, { wrapper: Wrapped });
    expect(getByTestId('home-jar').props.accessibilityLabel).toBe('Your jar, full');
  });

  it('compose: drop folds, then only leaves; the add belongs to Home after the dismiss (BUG-3)', async () => {
    mockAdd.mockResolvedValue('c1');
    mockDraft.text = 'Sunny walk';
    const { getByTestId } = await render(<Compose />, { wrapper: Wrapped });
    await fireEvent.press(getByTestId('mood-pink'));
    expect(getByTestId('mood-pink').props.accessibilityState.selected).toBe(true);
    await fireEvent.press(getByTestId('compose-drop'));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockDraft.clear).not.toHaveBeenCalled();
    expect(dropCoordinator.pending()).toEqual({ text: 'Sunny walk', colour: 'pink' });
    await fireEvent.press(getByTestId('compose-drop')); // second tap does nothing
    expect(mockBack).toHaveBeenCalledTimes(1);
    dropCoordinator.cancel();
  });

  it('compose: empty draft disables drop, counter reads out', async () => {
    const { getByTestId } = await render(<Compose />, { wrapper: Wrapped });
    expect(getByTestId('compose-drop').props.accessibilityState.disabled).toBe(true);
    expect(getByTestId('compose-counter').props.accessibilityLabel).toBe('0 of 140 characters');
    for (const m of ['red', 'yellow', 'green', 'blue', 'pink', 'orange', 'sky']) {
      expect(getByTestId(`mood-${m}`).props.accessibilityLabel).toMatch(/mood colour/);
    }
  });
});
