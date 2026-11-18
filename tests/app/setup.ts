/// <reference types="jest" />
// Jest setup. Mocks native modules that have no JS implementation under test.
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  const { SafeAreaProvider, initialWindowMetrics } = actual;
  return { ...actual, SafeAreaProvider, initialWindowMetrics };
});

// The Convex-backed hooks are mocked: UI tests never touch the network.
export const mockSave = jest.fn();
export const mockNotes: { current: { _id: string; text: string }[] | undefined } = { current: [] };
jest.mock('@/lib/data', () => ({
  DataProvider: ({ children }: { children: unknown }) => children,
  useEnsureAnonymousSignIn: () => ({ isReady: true, error: null }),
  useTestNotes: () => require('./setup').mockNotes.current,
  useSaveTestNote: () => require('./setup').mockSave,
}));

