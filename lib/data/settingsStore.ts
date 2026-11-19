/**
 * Settings cache + pending patch, over a tiny key-value store (expo-secure-store
 * in production). Effective settings = defaults < server < pending patch, so an
 * edit shows at once, survives a cold start and syncs when online. Last write wins.
 */
import { DEFAULT_SETTINGS, type Settings, type SettingsPatch } from "./settingsShape";
import type { KeyValueStore } from "./outbox";

export const SETTINGS_CACHE_KEY = "jarful.settings.cache";
export const SETTINGS_PENDING_KEY = "jarful.settings.pending";

export type SyncKv = KeyValueStore & { getItemSync?: (key: string) => string | null };

function parse<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function createSettingsStore(kv: SyncKv) {
  let server: Settings | null = null; // last known (cache or live)
  let pending: SettingsPatch | null = null;
  let snapshot: Settings = { ...DEFAULT_SETTINGS };
  let loaded: Promise<void> | null = null;
  let flushing: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  const recompute = () => {
    const next = { ...DEFAULT_SETTINGS, ...(server ?? {}), ...(pending ?? {}) } as Settings;
    if ((Object.keys(next) as (keyof Settings)[]).some((k) => next[k] !== snapshot[k])) snapshot = next;
  };
  const emit = () => {
    recompute();
    listeners.forEach((l) => l());
  };
  const persistPending = () =>
    pending && Object.keys(pending).length
      ? kv.setItem(SETTINGS_PENDING_KEY, JSON.stringify(pending))
      : kv.removeItem(SETTINGS_PENDING_KEY);
  const persistCache = () => kv.setItem(SETTINGS_CACHE_KEY, JSON.stringify(server ?? DEFAULT_SETTINGS));

  // Synchronous read where the platform allows it: first render is already right.
  try {
    const c = parse<Settings>(kv.getItemSync?.(SETTINGS_CACHE_KEY));
    const p = parse<SettingsPatch>(kv.getItemSync?.(SETTINGS_PENDING_KEY));
    if (c) server = c;
    if (p) pending = p;
    recompute();
  } catch {}

  function load() {
    loaded ??= (async () => {
      const c = parse<Settings>(await kv.getItem(SETTINGS_CACHE_KEY));
      const p = parse<SettingsPatch>(await kv.getItem(SETTINGS_PENDING_KEY));
      // Never overwrite anything that arrived while loading.
      if (c && !server) server = c;
      if (p) pending = { ...p, ...(pending ?? {}) };
      emit();
    })().catch(() => {});
    return loaded;
  }

  return {
    load,
    get: () => snapshot,
    hasPending: () => pending !== null,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    /** Apply a patch now (optimistic) and keep it until the server has it. */
    async update(patch: SettingsPatch) {
      pending = { ...(pending ?? {}), ...patch };
      emit();
      await persistPending().catch(() => {});
    },
    /** Live value from Convex. A still-pending local edit keeps winning until it syncs. */
    async setServer(s: Settings) {
      server = s;
      emit();
      await persistCache().catch(() => {});
    },
    flush(send: (patch: SettingsPatch) => Promise<Settings>) {
      flushing ??= (async () => {
        try {
          await load();
          while (pending && Object.keys(pending).length) {
            const sent = pending;
            let result: Settings;
            try {
              result = await send(sent);
            } catch {
              return; // transient: keep it queued
            }
            // Drop only what was sent and not changed since.
            const rest = { ...(pending ?? {}) } as Record<string, unknown>;
            for (const k of Object.keys(sent)) {
              if (rest[k] === (sent as Record<string, unknown>)[k]) delete rest[k];
            }
            pending = Object.keys(rest).length ? (rest as SettingsPatch) : null;
            server = { ...result };
            emit();
            await persistPending().catch(() => {});
            await persistCache().catch(() => {});
          }
        } finally {
          flushing = null;
        }
      })();
      return flushing;
    },
    /** Sign-out or account delete: forget everything on this device. */
    async reset() {
      server = null;
      pending = null;
      emit();
      await Promise.all([kv.removeItem(SETTINGS_CACHE_KEY), kv.removeItem(SETTINGS_PENDING_KEY)]).catch(() => {});
    },
  };
}
