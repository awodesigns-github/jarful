/// <reference types="jest" />
import { createSettingsStore, SETTINGS_CACHE_KEY, SETTINGS_PENDING_KEY } from '@/lib/data/settingsStore';
import { DEFAULT_SETTINGS, type Settings } from '@/lib/data/settingsShape';

function kv(init: Record<string, string> = {}, sync = false) {
  const m = new Map(Object.entries(init));
  return {
    m,
    getItem: async (k: string) => m.get(k) ?? null,
    setItem: async (k: string, v: string) => void m.set(k, v),
    removeItem: async (k: string) => void m.delete(k),
    ...(sync ? { getItemSync: (k: string) => m.get(k) ?? null } : {}),
  };
}
const cached: Settings = { reminderTime: '08:00', theme: 'dark', reducedMotion: 'on', haptics: false };

describe('settings store', () => {
  it('starts on defaults', () => {
    expect(createSettingsStore(kv()).get()).toEqual(DEFAULT_SETTINGS);
  });

  it('restores the cache on cold start (sync on first render, async otherwise)', async () => {
    const init = { [SETTINGS_CACHE_KEY]: JSON.stringify(cached) };
    expect(createSettingsStore(kv(init, true)).get()).toEqual(cached);
    const s = createSettingsStore(kv(init));
    expect(s.get()).toEqual(DEFAULT_SETTINGS); // never blocks the first render
    await s.load();
    expect(s.get()).toEqual(cached);
  });

  it('shows an optimistic update instantly and persists the pending patch', async () => {
    const store = kv();
    const s = createSettingsStore(store);
    const p = s.update({ theme: 'light' });
    expect(s.get().theme).toBe('light'); // before any await
    await p;
    expect(JSON.parse(store.m.get(SETTINGS_PENDING_KEY)!)).toEqual({ theme: 'light' });
  });

  it('queues offline, survives a restart, then syncs and clears', async () => {
    const store = kv();
    const a = createSettingsStore(store);
    await a.update({ haptics: false });
    await a.update({ reminderTime: '07:15' });
    // app killed; restart
    const b = createSettingsStore(store);
    await b.load();
    expect(b.get()).toMatchObject({ haptics: false, reminderTime: '07:15' });
    const send = jest.fn(async (p) => ({ ...DEFAULT_SETTINGS, ...p }) as Settings);
    await b.flush(send);
    expect(send).toHaveBeenCalledWith({ haptics: false, reminderTime: '07:15' });
    expect(b.hasPending()).toBe(false);
    expect(store.m.has(SETTINGS_PENDING_KEY)).toBe(false);
    expect(JSON.parse(store.m.get(SETTINGS_CACHE_KEY)!)).toMatchObject({ haptics: false, reminderTime: '07:15' });
  });

  it('keeps the patch when the send fails, and keeps edits made mid-flight', async () => {
    const s = createSettingsStore(kv());
    await s.update({ theme: 'dark' });
    await s.flush(async () => { throw new Error('offline'); });
    expect(s.hasPending()).toBe(true);
    expect(s.get().theme).toBe('dark');
    await s.flush(async (p) => {
      await s.update({ theme: 'light' }); // user edits during the send
      return { ...DEFAULT_SETTINGS, ...p } as Settings;
    });
    expect(s.get().theme).toBe('light');
    expect(s.hasPending()).toBe(false); // second loop iteration sent it
  });

  it('a pending edit wins over a live server value until synced', async () => {
    const s = createSettingsStore(kv());
    await s.update({ theme: 'dark' });
    await s.setServer({ ...DEFAULT_SETTINGS, theme: 'light', haptics: false });
    expect(s.get()).toMatchObject({ theme: 'dark', haptics: false });
  });
});
