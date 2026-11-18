/// <reference types="jest" />
import { fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '@/theme';
import { darkTheme, lightTheme } from '@/theme/tokens';
import Home from '@/app/index';
import Compose from '@/app/compose';
import Archive from '@/app/archive';
import Settings from '@/app/settings';

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

describe('placeholder screens (US-13 shell)', () => {
  const cases: [string, React.ComponentType, string][] = [
    ['index', Home, 'Home, your jar'],
    ['compose', Compose, 'Add a note'],
    ['archive', Archive, 'Archive of notes'],
    ['settings', Settings, 'Settings'],
  ];

  it.each(cases)('%s renders with testID and accessibility label', async (id, Screen, label) => {
    const { getByTestId } = await render(<Screen />, { wrapper: Wrapped });
    const el = getByTestId(`screen-${id}`);
    // Home holds the temporary test-note control, so it is not one grouped element.
    expect(el.props.accessible).toBe(id !== 'index');
    expect(el.props.accessibilityLabel).toBe(label);
  });

  it('home has a header and three links of at least 48 dp', async () => {
    const { getByTestId, getByRole } = await render(<Home />, { wrapper: Wrapped });
    expect(getByRole('header')).toHaveTextContent('Jarful');
    for (const id of ['compose', 'archive', 'settings']) {
      const link = getByTestId(`link-${id}`);
      expect(link.props.accessibilityRole).toBe('link');
      expect(link.props.accessibilityLabel).toBeTruthy();
      const flat = Object.assign({}, ...[link.props.style].flat(2).filter(Boolean));
      expect(flat.minHeight).toBeGreaterThanOrEqual(48);
      expect(flat.minWidth).toBeGreaterThanOrEqual(48);
    }
  });
});

function Probe() {
  const { theme, scheme, mode, setMode } = useTheme();
  return (
    <>
      <Text testID="scheme">{scheme}</Text>
      <Text testID="mode">{mode}</Text>
      <Text testID="bg">{theme.colors.bgBase}</Text>
      <Text testID="set-dark" onPress={() => setMode('dark')}>d</Text>
      <Text testID="set-system" onPress={() => setMode('system')}>s</Text>
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
    const { getByTestId } = await render(<Probe />, { wrapper: ThemeProvider });
    await fireEvent.press(getByTestId('set-dark'));
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

describe('M0 temporary test-note control (US-13 save path)', () => {
  const { mockSave, mockNotes } = require('./setup');
  beforeEach(() => {
    mockSave.mockReset();
    mockNotes.current = [];
  });

  it('shows a welcoming empty state and a disabled save button', async () => {
    const { getByTestId, getByText } = await render(<Home />, { wrapper: Wrapped });
    expect(getByText('No test notes yet.')).toBeTruthy();
    expect(getByTestId('m0-save-note').props.accessibilityState.disabled).toBe(true);
  });

  it('saves the typed text and clears the field', async () => {
    mockSave.mockResolvedValue('id1');
    const { getByTestId } = await render(<Home />, { wrapper: Wrapped });
    await fireEvent.changeText(getByTestId('m0-note-input'), 'Sunny walk');
    await fireEvent.press(getByTestId('m0-save-note'));
    expect(mockSave).toHaveBeenCalledWith({ text: 'Sunny walk' });
    expect(getByTestId('m0-note-input').props.value).toBe('');
  });

  it('keeps the draft and shows a calm message when the save fails', async () => {
    mockSave.mockRejectedValue(new Error('offline'));
    const { getByTestId, findByTestId } = await render(<Home />, { wrapper: Wrapped });
    await fireEvent.changeText(getByTestId('m0-note-input'), 'Kept words');
    await fireEvent.press(getByTestId('m0-save-note'));
    const msg = await findByTestId('m0-save-problem');
    expect(msg).toBeTruthy();
    expect(getByTestId('m0-note-input').props.value).toBe('Kept words');
  });

  it('caps the field at 140 characters', async () => {
    const { getByTestId } = await render(<Home />, { wrapper: Wrapped });
    expect(getByTestId('m0-note-input').props.maxLength).toBe(140);
  });

  it('lists notes with emoji and non-Latin text intact', async () => {
    mockNotes.current = [
      { _id: 'a', text: '今日はいい日 🌞' },
      { _id: 'b', text: 'x'.repeat(140) },
    ];
    const { getByTestId } = await render(<Home />, { wrapper: Wrapped });
    expect(getByTestId('m0-note-a')).toHaveTextContent('今日はいい日 🌞');
    expect(getByTestId('m0-note-b').props.children).toHaveLength(140);
  });
});
