/// <reference types="jest" />
// US-01 compose states (counter, mood, disabled drop). Gherkin: docs/stories.md US-01.
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme';
import Compose from '@/app/compose';
import { CharCounter } from '@/components/CharCounter';

const metrics = { frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
const Wrapped = ({ children }: { children: React.ReactNode }) => (
  <SafeAreaProvider initialMetrics={metrics}>
    <ThemeProvider>{children}</ThemeProvider>
  </SafeAreaProvider>
);

jest.mock('expo-router', () => {
  const actual = jest.requireActual('expo-router');
  return { ...actual, useRouter: () => ({ back: jest.fn(), canGoBack: () => true, replace: jest.fn(), push: jest.fn() }) };
});

const { mockDraft } = require('./setup');

describe('140 counter states', () => {
  const label = async (n: number) => {
    const { getByTestId } = await render(<CharCounter testID="c" count={n} />, { wrapper: Wrapped });
    return getByTestId('c').props.accessibilityLabel as string;
  };
  it('normal below 120', async () => {
    expect(await label(0)).toBe('0 of 140 characters');
    expect(await label(119)).toBe('119 of 140 characters');
  });
  it('near limit from 120 to 139', async () => {
    expect(await label(120)).toMatch(/Nearly at the limit/);
    expect(await label(139)).toMatch(/Nearly at the limit/);
  });
  it('at limit at 140', async () => {
    expect(await label(140)).toMatch(/At the limit/);
  });
  it('over 141 is gentle, no red or warning wording', async () => {
    const l = await label(141);
    expect(l).toMatch(/trim a little/);
    expect(l).not.toMatch(/error|warning|invalid|wrong/i);
  });
  it('shows only the count, never a streak or missed-day text', async () => {
    const { queryByText } = await render(<CharCounter count={130} />, { wrapper: Wrapped });
    expect(queryByText(/streak|missed|catch up/i)).toBeNull();
    expect(queryByText('130 / 140')).not.toBeNull();
  });
});

describe('compose screen', () => {
  beforeEach(() => {
    mockDraft.text = '';
  });
  const drop = (r: { getByTestId: (id: string) => { props: Record<string, any> } }) =>
    r.getByTestId('compose-drop').props.accessibilityState.disabled;

  it('Drop it in is disabled when empty', async () => {
    const r = await render(<Compose />, { wrapper: Wrapped });
    expect(drop(r)).toBe(true);
  });
  it('Drop it in is disabled for whitespace only', async () => {
    mockDraft.text = '   \n ';
    const r = await render(<Compose />, { wrapper: Wrapped });
    expect(drop(r)).toBe(true);
  });
  it('enabled with text at exactly 140', async () => {
    mockDraft.text = 'a'.repeat(140);
    const r = await render(<Compose />, { wrapper: Wrapped });
    expect(drop(r)).toBe(false);
  });
  it('disabled at 141, counter explains gently', async () => {
    mockDraft.text = 'a'.repeat(141);
    const r = await render(<Compose />, { wrapper: Wrapped });
    expect(drop(r)).toBe(true);
    expect(r.getByTestId('compose-counter').props.accessibilityLabel).toMatch(/141 of 140/);
  });
  it('mood: one at a time, tap again clears (optional)', async () => {
    const r = await render(<Compose />, { wrapper: Wrapped });
    const sel = (m: string) => r.getByTestId(`mood-${m}`).props.accessibilityState.selected;
    expect(sel('blue')).toBe(false);
    await fireEvent.press(r.getByTestId('mood-blue'));
    expect(sel('blue')).toBe(true);
    await fireEvent.press(r.getByTestId('mood-green'));
    expect(sel('blue')).toBe(false);
    expect(sel('green')).toBe(true);
    await fireEvent.press(r.getByTestId('mood-green'));
    expect(sel('green')).toBe(false);
  });
  it('typing goes to the draft', async () => {
    const r = await render(<Compose />, { wrapper: Wrapped });
    mockDraft.setText.mockClear();
    await fireEvent.changeText(r.getByTestId('compose-input'), 'Coffee with Sam');
    expect(mockDraft.setText).toHaveBeenCalledWith('Coffee with Sam');
  });
  it('emoji and non-Latin text enable the button', async () => {
    mockDraft.text = '今日はいい日 🌸 مرحبا';
    const r = await render(<Compose />, { wrapper: Wrapped });
    expect(drop(r)).toBe(false);
  });
});
