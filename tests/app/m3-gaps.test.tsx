/// <reference types="jest" />
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme';
import Archive from '@/app/archive';
import Shelf from '@/app/shelf';
import Settings from '@/app/settings';
import { REMINDER_COPY } from '@/components/settings/reminder';
import { mockArchive, mockShelf, mockSettings } from './setup';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true, replace: jest.fn(), push: jest.fn() }),
}));

const metrics = { frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
const Wrapped = ({ children }: { children: React.ReactNode }) => (
  <SafeAreaProvider initialMetrics={metrics}>
    <ThemeProvider>{children}</ThemeProvider>
  </SafeAreaProvider>
);
const at = (y: number, m: number, d: number) => new Date(y, m, d, 12).getTime();
const note = (id: string, createdAt: number, over: object = {}) => ({
  _id: id, jarId: 'j1', text: `text ${id}`, colour: 'blue', createdAt, isFavourite: false, pending: false, ...over,
});
// Guilt wording and the red status colours (light and night; mood red is a note colour, so it is allowed) that must not appear outside delete.
const GUILT = /streak|missed|catch.?up|days? (ago|in a row|since)|behind|overdue|you haven'?t|don'?t break|lost/i;
const RED = /#b83a2b|#f08070/i;
const dump = (r: { toJSON: () => unknown }) => {
  const seen = new WeakSet<object>();
  return JSON.stringify(r.toJSON(), (k, v) => {
    if (k === '_owner' || k === '_store' || k === '_debugOwner') return undefined;
    if (typeof v === 'function') return undefined;
    if (v && typeof v === 'object') {
      if (seen.has(v)) return undefined;
      seen.add(v);
    }
    return v;
  });
};

beforeEach(() => {
  mockArchive.status = 'Exhausted';
  mockArchive.loadMore.mockReset();
  mockShelf.current = [];
});

describe('M3 gaps: archive (US-08, US-05, US-28)', () => {
  it('shows a 140-character note in full, with no line limit (US-08 long note)', async () => {
    const long = 'x'.repeat(131) + ' good day';
    expect(long).toHaveLength(139 + 1);
    mockArchive.all = [note('l', at(2026, 10, 2), { text: long })];
    const { getByText, getByLabelText } = await render(<Archive />, { wrapper: Wrapped });
    const el = getByText(long);
    expect(el.props.numberOfLines).toBeUndefined();
    expect(el.props.ellipsizeMode).toBeUndefined();
    expect(getByLabelText(`Note from 2 November: ${long}`)).toBeTruthy();
  });

  it('January and March only: two months, no empty-day or gap text, no red (US-05 archive gaps)', async () => {
    mockArchive.all = [note('m', at(2026, 2, 9)), note('j', at(2026, 0, 14))];
    const r = await render(<Archive />, { wrapper: Wrapped });
    const headings = r.getAllByRole('header').map((h) => h.props.children).filter((c) => typeof c === 'string' && /\d{4}/.test(c));
    expect(headings).toEqual(['March 2026', 'January 2026']);
    expect(r.queryByText(/February/)).toBeNull();
    const out = dump(r);
    expect(out).not.toMatch(GUILT);
    expect(out).not.toMatch(RED);
  });

  it('the filtered-empty and no-notes states are warm: no counts, no guilt, no red', async () => {
    mockArchive.all = [];
    mockArchive.favs = [];
    const r = await render(<Archive />, { wrapper: Wrapped });
    expect(dump(r)).not.toMatch(GUILT);
    expect(dump(r)).not.toMatch(RED);
    expect(dump(r)).not.toMatch(/\b0 notes?\b/i);
    await fireEvent.press(r.getByTestId('archive-filter-favourites'));
    expect(dump(r)).not.toMatch(RED);
    expect(dump(r)).not.toMatch(GUILT);
  });

  it('500 notes across many months render without a count, streak or red', async () => {
    mockArchive.all = Array.from({ length: 520 }, (_, i) => note(`n${i}`, at(2024, 0, 1) + i * 3 * 86_400_000));
    mockArchive.status = 'CanLoadMore';
    const r = await render(<Archive />, { wrapper: Wrapped });
    expect(dump(r)).not.toMatch(GUILT);
    expect(dump(r)).not.toMatch(RED);
  });

  it('shelf has no red or guilt wording (US-09)', async () => {
    mockShelf.current = [
      { jarId: 'a', name: null, startedAt: at(2026, 0, 1), sealedAt: at(2026, 2, 1), capacity: 30, noteCount: 30, colours: ['blue', 'pink'] },
    ];
    const r = await render(<Shelf />, { wrapper: Wrapped });
    expect(dump(r)).not.toMatch(GUILT);
    expect(dump(r)).not.toMatch(RED);
  });
});

describe('M3 gaps: reminder and settings (US-04, US-05, US-29)', () => {
  it('reminder text is warm and carries no streak or missed-day wording (US-04, US-05)', () => {
    expect(`${REMINDER_COPY.title} ${REMINDER_COPY.body}`).not.toMatch(GUILT);
    expect(REMINDER_COPY.body).toMatch(/\?|here/);
  });

  it('Off state has no time row and no red; a set time reads as 20:30 (US-29)', async () => {
    mockSettings.current.reminderTime = null;
    const off = await render(<Settings />, { wrapper: Wrapped });
    expect(off.getByTestId('toggle-reminder').props.accessibilityState).toEqual({ checked: false });
    expect(off.queryByTestId('reminder-time-row')).toBeNull();
    expect(dump(off)).not.toMatch(RED);
    off.unmount();
    mockSettings.current.reminderTime = '20:30';
    const on = await render(<Settings />, { wrapper: Wrapped });
    expect(on.getByTestId('toggle-reminder').props.accessibilityState).toEqual({ checked: true });
    expect(on.getByTestId('reminder-time-row')).toBeTruthy();
    expect(dump(on)).toContain('20:30');
    expect(dump(on)).not.toMatch(RED);
  });
});
