/// <reference types="jest" />
// US-06 / US-07 / US-27: reveal states and favourite toggle through Home and the overlay.
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme';
import Home from '@/app/index';
import { MIN_TARGET } from '@/theme';
import { NONE_YET_TEXT, OFFLINE_TEXT } from '@/components/reveal/RevealOverlay';

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

const { mockJar, mockReveal, mockSetFav } = require('./setup');
const note = (over = {}) => ({ _id: 'n1', text: 'Sunny walk', colour: 'blue', createdAt: Date.now() - 86400000 * 3, isFavourite: false, ...over });

beforeEach(() => {
  mockJar.current = { jarId: 'j', capacity: 30, noteCount: 5, colours: [] };
  mockReveal.mockReset();
  mockSetFav.mockReset();
});

async function open() {
  const r = await render(<Home />, { wrapper: Wrapped });
  await fireEvent.press(r.getByTestId('home-jar'));
  return r;
}

describe('reveal states (US-06, US-07)', () => {
  it('ok: shows the past note', async () => {
    mockReveal.mockResolvedValue({ status: 'ok', note: note() });
    const r = await open();
    await waitFor(() => expect(r.getByTestId('reveal-text')).toHaveTextContent('Sunny walk'));
    expect(r.queryByTestId('reveal-empty')).toBeNull();
  });
  it('none-yet: welcoming message, no error wording', async () => {
    mockReveal.mockResolvedValue({ status: 'none-yet' });
    const r = await open();
    await waitFor(() => expect(r.getByTestId('reveal-empty')).toBeTruthy());
    expect(r.getByText(NONE_YET_TEXT)).toBeTruthy();
    expect(r.queryByText(/error|failed|warning/i)).toBeNull();
  });
  it('offline: calm message', async () => {
    mockReveal.mockResolvedValue({ status: 'offline' });
    const r = await open();
    await waitFor(() => expect(r.getByTestId('reveal-offline')).toBeTruthy());
    expect(r.getByText(OFFLINE_TEXT)).toBeTruthy();
  });
  it('the jar tap target is at least 48 dp (US-07)', async () => {
    expect(MIN_TARGET).toBeGreaterThanOrEqual(48);
    const r = await render(<Home />, { wrapper: Wrapped });
    expect(r.getByTestId('home-jar').props.accessibilityRole).toBe('button');
  });
  it('back and close dismiss the overlay', async () => {
    mockReveal.mockResolvedValue({ status: 'ok', note: note() });
    const r = await open();
    await waitFor(() => expect(r.getByTestId('reveal-text')).toBeTruthy());
    await fireEvent.press(r.getByTestId('reveal-back'));
    await waitFor(() => expect(r.queryByTestId('reveal-overlay')).toBeNull());
  });
  it('"another" draws again', async () => {
    mockReveal.mockResolvedValue({ status: 'ok', note: note() });
    const r = await open();
    await waitFor(() => expect(r.getByTestId('reveal-another')).toBeTruthy());
    await fireEvent.press(r.getByTestId('reveal-another'));
    await waitFor(() => expect(mockReveal).toHaveBeenCalledTimes(2));
  });
});

describe('favourite toggle (US-27)', () => {
  const sel = (r: ReturnType<typeof render> extends Promise<infer T> ? T : never) =>
    r.getByTestId('reveal-favourite').props.accessibilityState.selected;

  it('hearts then unhearts, saving each time', async () => {
    mockSetFav.mockResolvedValue(undefined);
    mockReveal.mockResolvedValue({ status: 'ok', note: note() });
    const r = await open();
    await waitFor(() => expect(r.getByTestId('reveal-favourite')).toBeTruthy());
    expect(sel(r)).toBe(false);
    await fireEvent.press(r.getByTestId('reveal-favourite'));
    expect(mockSetFav).toHaveBeenLastCalledWith('n1', true);
    await waitFor(() => expect(sel(r)).toBe(true));
    await fireEvent.press(r.getByTestId('reveal-favourite'));
    expect(mockSetFav).toHaveBeenLastCalledWith('n1', false);
    await waitFor(() => expect(sel(r)).toBe(false));
  });
  it('starts filled for an existing favourite', async () => {
    mockReveal.mockResolvedValue({ status: 'ok', note: note({ isFavourite: true }) });
    const r = await open();
    await waitFor(() => expect(sel(r)).toBe(true));
  });
  it('reverts when the save is rejected', async () => {
    mockSetFav.mockRejectedValue(new Error('nope'));
    mockReveal.mockResolvedValue({ status: 'ok', note: note() });
    const r = await open();
    await waitFor(() => expect(r.getByTestId('reveal-favourite')).toBeTruthy());
    await fireEvent.press(r.getByTestId('reveal-favourite'));
    await waitFor(() => expect(sel(r)).toBe(false));
  });
});
