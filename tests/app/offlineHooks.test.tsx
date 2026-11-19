/// <reference types="jest" />
// useDraft (restore after relaunch) and useOutboxSync (flush when the connection returns).
import { act, renderHook, waitFor } from '@testing-library/react-native';

const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => mockStore.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void mockStore.set(k, v),
  deleteItemAsync: async (k: string) => void mockStore.delete(k),
}));

const mockConn = {
  connected: false,
  listeners: new Set<(s: { isWebSocketConnected: boolean }) => void>(),
  set(v: boolean) {
    this.connected = v;
    this.listeners.forEach((l) => l({ isWebSocketConnected: v }));
  },
};
const mockAuth = { isAuthenticated: true };
const mockSent: Record<string, unknown>[] = [];
const mockSend = jest.fn(async (a: Record<string, unknown>) => void mockSent.push(a));
jest.mock('convex/react', () => ({
  useConvex: () => ({
    connectionState: () => ({ isWebSocketConnected: mockConn.connected }),
    subscribeToConnectionState: (cb: (s: { isWebSocketConnected: boolean }) => void) => {
      mockConn.listeners.add(cb);
      return () => mockConn.listeners.delete(cb);
    },
  }),
  useConvexAuth: () => ({ isAuthenticated: mockAuth.isAuthenticated, isLoading: false }),
  useMutation: () => Object.assign((a: Record<string, unknown>) => mockSend(a), { withOptimisticUpdate: function () { return this; } }),
}));
jest.mock('../../convex/_generated/api', () => ({ api: { notes: { addNote: 'addNote' } } }));

import { outbox, useAddNote, useDraft, useOutboxSync, usePendingNotes } from '@/lib/data/offline';

beforeEach(async () => {
  mockStore.clear();
  mockSent.length = 0;
  mockSend.mockClear();
  mockConn.connected = false;
  mockConn.listeners.clear();
  mockAuth.isAuthenticated = true;
  // reset the module-level outbox
  await outbox.load();
});
describe('useDraft (US-01, offline draft)', () => {
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] }));
  afterEach(() => jest.useRealTimers());

  it('saves after the 400 ms debounce and restores in a fresh mount (relaunch)', async () => {
    const first = await renderHook(() => useDraft());
    await act(async () => first.result.current.setText('Walked by the river'));
    expect(mockStore.size).toBe(0); // not yet: debounced
    await act(async () => void jest.advanceTimersByTime(450));
    expect([...mockStore.values()]).toContain('Walked by the river');
    await first.unmount();

    const second = await renderHook(() => useDraft());
    await waitFor(() => expect(second.result.current.text).toBe('Walked by the river'));
  });
  it('restore never overwrites what the user already typed', async () => {
    mockStore.set('jarful.draft', 'old draft');
    const { result } = await renderHook(() => useDraft());
    await act(async () => result.current.setText('new'));
    await act(async () => void jest.advanceTimersByTime(10));
    expect(result.current.text).toBe('new');
  });
  it('clear() removes the saved draft', async () => {
    const { result } = await renderHook(() => useDraft());
    await act(async () => result.current.setText('x'));
    await act(async () => void jest.advanceTimersByTime(450));
    expect(mockStore.size).toBe(1);
    await act(async () => result.current.clear());
    expect(result.current.text).toBe('');
    expect(mockStore.size).toBe(0);
  });
  it('keeps a 140-grapheme emoji and non-Latin draft intact', async () => {
    const text = '🌸'.repeat(70) + 'いい日'.repeat(20);
    const first = await renderHook(() => useDraft());
    await act(async () => first.result.current.setText(text));
    await act(async () => void jest.advanceTimersByTime(450));
    await first.unmount();
    const second = await renderHook(() => useDraft());
    await waitFor(() => expect(second.result.current.text).toBe(text));
  });
});

describe('outbox flush when the connection returns (US-13 offline, M2 airplane check)', () => {
  it('holds a note while offline, sends it once when the connection returns', async () => {
    const hook = await renderHook(() => ({ add: useAddNote(), sync: useOutboxSync(), p: usePendingNotes() }));
    await act(async () => void (await hook.result.current.add({ text: 'Offline joy', colour: 'pink' })));
    expect(hook.result.current.p.pendingCount).toBe(1);
    expect(mockSend).not.toHaveBeenCalled();

    await act(async () => mockConn.set(true));
    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    expect(mockSent[0]).toMatchObject({ text: 'Offline joy', colour: 'pink' });
    expect(typeof mockSent[0].clientId).toBe('string');
    await waitFor(() => expect(hook.result.current.p.pendingCount).toBe(0));

    // a flapping connection does not resend it
    await act(async () => mockConn.set(false));
    await act(async () => mockConn.set(true));
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
  it('sends several notes in the order written', async () => {
    const hook = await renderHook(() => ({ add: useAddNote(), sync: useOutboxSync() }));
    for (const t of ['one', 'two', 'three']) await act(async () => void (await hook.result.current.add({ text: t })));
    await act(async () => mockConn.set(true));
    await waitFor(() => expect(mockSent.map((s) => s.text)).toEqual(['one', 'two', 'three']));
  });
  it('does not send while signed out, then sends once signed in', async () => {
    mockAuth.isAuthenticated = false;
    mockConn.connected = true;
    const hook = await renderHook(() => ({ add: useAddNote(), sync: useOutboxSync() }));
    await act(async () => void (await hook.result.current.add({ text: 'wait for me' })));
    expect(mockSend).not.toHaveBeenCalled();
    mockAuth.isAuthenticated = true;
    await hook.rerender({});
    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
  });
  it('online at write time sends straight away, exactly once', async () => {
    mockConn.connected = true;
    const hook = await renderHook(() => ({ add: useAddNote(), sync: useOutboxSync() }));
    await act(async () => void (await hook.result.current.add({ text: 'instant' })));
    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
  });
  it('rejects an empty note', async () => {
    const { result } = await renderHook(() => useAddNote());
    await expect(result.current({ text: '   ' })).rejects.toThrow();
  });
});
