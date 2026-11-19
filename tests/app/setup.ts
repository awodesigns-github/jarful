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
export const mockReveal = jest.fn();
export const mockSetFav = jest.fn();
export const mockDraft = { text: '', setText: jest.fn(), clear: jest.fn() };
export const mockArchive: { favs: unknown; all: unknown; status: string; loadMore: jest.Mock } = { favs: [], all: [], status: 'Exhausted', loadMore: jest.fn() };
export const mockSeal: { current: { jarId: string; sealedAt: number } | null | undefined } = { current: null };
export const mockShelf: { current: unknown[] | undefined } = { current: [] };
export const mockJarNotes: { current: unknown[] | undefined } = { current: [] };
export const mockNotes: { current: { _id: string; text: string }[] | undefined } = { current: [] };
export const mockSettings = { current: { reminderTime: null as string | null, theme: 'system', reducedMotion: 'system', haptics: true } };
export const mockUpdate = jest.fn().mockResolvedValue(undefined);
beforeEach(() => {
  mockSettings.current = { reminderTime: null, theme: 'system', reducedMotion: 'system', haptics: true };
  mockUpdate.mockClear();
});
jest.mock('@/lib/data', () => ({
  useSettings: () => require('./setup').mockSettings.current,
  useUpdateSettings: () => require('./setup').mockUpdate,
  DataProvider: ({ children }: { children: unknown }) => children,
  useEnsureAnonymousSignIn: () => ({ isReady: true, error: null }),
  useTestNotes: () => require('./setup').mockNotes.current,
  useSaveTestNote: () => require('./setup').mockSave,
  useCurrentJar: () => require('./setup').mockJar.current,
  usePendingNotes: () => ({ pendingCount: require('./setup').mockPending.current }),
  useRevealNote: () => require('./setup').mockReveal,
  useSetFavourite: () => require('./setup').mockSetFav,
  useArchive: ({ favouritesOnly }: { favouritesOnly?: boolean } = {}) => {
    const m = require('./setup').mockArchive;
    const notes = favouritesOnly ? m.favs : m.all;
    return { notes, months: jest.requireActual('@/lib/data/archive').groupByMonth(notes), status: m.status, loadMore: m.loadMore };
  },
  useLastSeal: () => require('./setup').mockSeal.current,
  useShelf: () => require('./setup').mockShelf.current,
  useJarNotes: () => require('./setup').mockJarNotes.current,
  useAddNote: () => require('./setup').mockAdd,
  useDraft: () => require('./setup').mockDraft,
  countNoteChars: (t: string) => Array.from(t).length,
  NOTE_MAX: 140,
  NOTE_RAW_MAX: 2000,
}));
jest.mock('@/components/useOnline', () => ({ useOnline: () => require('./setup').mockOnline.current }));


// Reanimated and worklets need native runtimes; use their JS mocks. No animation runs in Jest.
jest.mock('@/motion/primitives', () => {
  const React = require('react');
  const { View } = require('react-native');
  const sv = (v: unknown) => {
    let cur = v;
    return { get: () => cur, set: (n: unknown) => { cur = n; } };
  };
  // Finish at once, so completion callbacks (the fold, the fall) run in tests.
  const anim = (to: unknown, _o?: unknown, cb?: (f: boolean) => void) => {
    cb?.(true);
    return to;
  };
  return {
    __esModule: true,
    scheduleOnRN: (fn: (...a: unknown[]) => void, ...args: unknown[]) => fn(...args),
    Animated: { View: React.forwardRef((p: object, r: unknown) => React.createElement(View, { ...p, ref: r })) },
    Easing: { bezier: () => (t: number) => t },
    ReduceMotion: { Never: "never", System: "system" },
    useSharedValue: (v: unknown) => React.useRef(sv(v)).current,
    useAnimatedStyle: (fn: () => object) => fn(),
    useReduced: () => false,
    withDelay: (_d: number, a: unknown) => a,
    withTiming: anim,
    withSpring: anim,
    withSequence: (...a: unknown[]) => a[a.length - 1],
  };
});
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('expo-sensors', () => ({ Accelerometer: { setUpdateInterval: jest.fn(), addListener: jest.fn(() => ({ remove: jest.fn() })) } }));

jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: false, status: 'denied' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, status: 'granted' }),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('id'),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));
