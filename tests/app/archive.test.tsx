/// <reference types="jest" />
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme';
import Archive from '@/app/archive';
import Shelf from '@/app/shelf';
import JarNotes from '@/app/jar/[jarId]';
import { mockArchive, mockSetFav, mockShelf, mockJarNotes } from './setup';

const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const actual = jest.requireActual('expo-router');
  return {
    ...actual,
    useRouter: () => ({ back: jest.fn(), canGoBack: () => true, replace: jest.fn(), push: mockPush }),
    useLocalSearchParams: () => ({ jarId: 'j1' }),
  };
});

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

beforeEach(() => {
  mockSetFav.mockReset().mockResolvedValue(undefined);
  mockArchive.all = [note('a', at(2026, 10, 12)), note('b', at(2026, 10, 3), { isFavourite: true }), note('c', at(2026, 8, 20))];
  mockArchive.favs = [note('b', at(2026, 10, 3), { isFavourite: true })];
  mockArchive.status = 'Exhausted';
  mockArchive.loadMore.mockReset();
  mockShelf.current = [];
  mockJarNotes.current = [];
});

describe('archive (US-08, US-28)', () => {
  it('groups by month, newest first, with headings and no gap markers', async () => {
    const { getAllByRole, getByTestId, queryByText } = await render(<Archive />, { wrapper: Wrapped });
    const headings = getAllByRole('header').map((h) => h.props.children).filter((c) => typeof c === 'string' && /\d{4}/.test(c));
    expect(headings).toEqual(['November 2026', 'September 2026']);
    expect(queryByText(/October/)).toBeNull();
    expect(getByTestId('archive-row-a').props.children).toBeDefined();
    expect(getByTestId('archive-list')).toBeTruthy();
  });

  it('labels a row with its date and favourite state', async () => {
    const { getByLabelText } = await render(<Archive />, { wrapper: Wrapped });
    expect(getByLabelText('Note from 3 November, favourite: text b')).toBeTruthy();
    expect(getByLabelText('Note from 12 November: text a')).toBeTruthy();
  });

  it('filters to favourites and back, with selected state on the chips', async () => {
    const { getByTestId, queryByTestId } = await render(<Archive />, { wrapper: Wrapped });
    expect(getByTestId('archive-filter-all').props.accessibilityState.selected).toBe(true);
    await fireEvent.press(getByTestId('archive-filter-favourites'));
    expect(getByTestId('archive-filter-favourites').props.accessibilityState.selected).toBe(true);
    expect(queryByTestId('archive-row-a')).toBeNull();
    expect(getByTestId('archive-row-b')).toBeTruthy();
    await fireEvent.press(getByTestId('archive-filter-all'));
    expect(getByTestId('archive-row-a')).toBeTruthy();
  });

  it('shows a warm empty state with no favourites and one for no notes', async () => {
    mockArchive.favs = [];
    const { getByTestId, getByText } = await render(<Archive />, { wrapper: Wrapped });
    await fireEvent.press(getByTestId('archive-filter-favourites'));
    expect(getByText('No favourites yet')).toBeTruthy();
    mockArchive.all = [];
    await fireEvent.press(getByTestId('archive-filter-all'));
    expect(getByText('Your jar is ready')).toBeTruthy();
    await fireEvent.press(getByTestId('archive-empty-add'));
    expect(mockPush).toHaveBeenCalledWith('/compose');
  });

  it('hearts optimistically and reverts when the write is rejected', async () => {
    mockSetFav.mockRejectedValueOnce(new Error('nope'));
    const { getByTestId } = await render(<Archive />, { wrapper: Wrapped });
    expect(getByTestId('archive-fav-a').props.accessibilityState.selected).toBe(false);
    await fireEvent.press(getByTestId('archive-fav-a'));
    expect(mockSetFav).toHaveBeenCalledWith('a', true);
    await waitFor(() => expect(getByTestId('archive-fav-a').props.accessibilityState.selected).toBe(false));
  });

  it('keeps the heart on when the write succeeds', async () => {
    const { getByTestId } = await render(<Archive />, { wrapper: Wrapped });
    await fireEvent.press(getByTestId('archive-fav-a'));
    expect(getByTestId('archive-fav-a').props.accessibilityState.selected).toBe(true);
  });

  it('tags pending notes and gives them no heart', async () => {
    mockArchive.all = [note('pending:x', at(2026, 10, 19), { pending: true, jarId: null }), ...(mockArchive.all as object[])];
    const { getByText, queryByTestId } = await render(<Archive />, { wrapper: Wrapped });
    expect(getByText('Saved on this phone')).toBeTruthy();
    expect(queryByTestId('archive-fav-pending:x')).toBeNull();
  });

  it('loads more at the end of the list', async () => {
    mockArchive.status = 'CanLoadMore';
    const { getByTestId } = await render(<Archive />, { wrapper: Wrapped });
    await fireEvent(getByTestId('archive-list'), 'endReached');
    expect(mockArchive.loadMore).toHaveBeenCalled();
  });

  it('links to the shelf', async () => {
    const { getByTestId } = await render(<Archive />, { wrapper: Wrapped });
    await fireEvent.press(getByTestId('archive-shelf-link'));
    expect(mockPush).toHaveBeenCalledWith('/shelf');
  });
});

describe('shelf (US-09)', () => {
  it('lists sealed jars with an accessible label and opens one', async () => {
    mockShelf.current = [
      { jarId: 'j2', name: null, startedAt: new Date(2026, 9, 1).getTime(), sealedAt: new Date(2026, 10, 9).getTime(), capacity: 30, noteCount: 30, colours: Array(30).fill('pink') },
    ];
    const { getByTestId, getByText } = await render(<Shelf />, { wrapper: Wrapped });
    expect(getByTestId('shelf-list')).toBeTruthy();
    expect(getByText('1 Oct to 9 Nov')).toBeTruthy();
    const jar = getByTestId('shelf-jar-j2');
    expect(jar.props.accessibilityLabel).toBe('Jar from 1 Oct to 9 Nov, 30 notes');
    await fireEvent.press(jar);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/jar/[jarId]', params: { jarId: 'j2' } });
  });

  it('welcomes an empty shelf without a countdown', async () => {
    const { getByTestId, getByText } = await render(<Shelf />, { wrapper: Wrapped });
    expect(getByTestId('shelf-empty')).toBeTruthy();
    expect(getByText(/seals when it holds 30 notes/)).toBeTruthy();
  });

  it('shows a sealed jar read-only, oldest first', async () => {
    mockJarNotes.current = [note('n2', at(2026, 10, 9)), note('n1', at(2026, 9, 1))];
    const { getByTestId, queryByTestId, getAllByTestId } = await render(<JarNotes />, { wrapper: Wrapped });
    expect(getByTestId('jar-notes-list')).toBeTruthy();
    expect(getAllByTestId(/archive-row-/).map((r) => r.props.testID)).toEqual(['archive-row-n1', 'archive-row-n2']);
    expect(queryByTestId('archive-fav-n1')).toBeNull();
  });
});
