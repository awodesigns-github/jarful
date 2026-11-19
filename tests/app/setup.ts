/// <reference types="jest" />
// Jest setup. Mocks native modules that have no JS implementation under test.
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  const { SafeAreaProvider, initialWindowMetrics } = actual;
  return { ...actual, SafeAreaProvider, initialWindowMetrics };
});

// The Convex-backed hooks are mocked: UI tests never touch the network.
export const mockSave = jest.fn();
export const mockJar: { current: { jarId: string; capacity: number; noteCount: number } | null | undefined } = { current: null };
export const mockPending = { current: 0 };
export const mockOnline = { current: true };
export const mockAdd = jest.fn();
export const mockDraft = { text: '', setText: jest.fn(), clear: jest.fn() };
export const mockNotes: { current: { _id: string; text: string }[] | undefined } = { current: [] };
jest.mock('@/lib/data', () => ({
  DataProvider: ({ children }: { children: unknown }) => children,
  useEnsureAnonymousSignIn: () => ({ isReady: true, error: null }),
  useTestNotes: () => require('./setup').mockNotes.current,
  useSaveTestNote: () => require('./setup').mockSave,
  useCurrentJar: () => require('./setup').mockJar.current,
  usePendingNotes: () => ({ pendingCount: require('./setup').mockPending.current }),
  useAddNote: () => require('./setup').mockAdd,
  useDraft: () => require('./setup').mockDraft,
  countNoteChars: (t: string) => Array.from(t).length,
  NOTE_MAX: 140,
  NOTE_RAW_MAX: 2000,
}));
jest.mock('@/components/useOnline', () => ({ useOnline: () => require('./setup').mockOnline.current }));

