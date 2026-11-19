import * as SecureStore from 'expo-secure-store';

/**
 * Which jars have had their seal moment. Kept in SecureStore so a seal plays once per jar,
 * even across restarts. Pure helpers take the store as a parameter so Jest can stub it.
 */
export type SealStore = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
};

export const secureSealStore: SealStore = {
  get: (k) => SecureStore.getItemAsync(k),
  set: (k, v) => SecureStore.setItemAsync(k, v),
};

export const SEAL_KEY = 'jarful.sealsPlayed';
const KEEP = 20;

export async function loadPlayedSeals(store: SealStore = secureSealStore): Promise<Set<string>> {
  try {
    const raw = await store.get(SEAL_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Returns the new set. A failed write still returns it, so this session never replays. */
export async function markSealPlayed(played: Set<string>, jarId: string, store: SealStore = secureSealStore): Promise<Set<string>> {
  const next = new Set(played);
  next.add(jarId);
  try {
    await store.set(SEAL_KEY, JSON.stringify([...next].slice(-KEEP)));
  } catch {
    /* keep the in-memory record */
  }
  return next;
}

/** Key for a seal started on the device before the server confirmed it. */
export const localSealKey = (jarId: string) => `local:${jarId}`;

/** The open jar, as the device sees it (server count plus notes still waiting to sync). */
export type OpenJarView = { jarId: string; noteCount: number; pendingCount: number; capacity: number };

export type SealGate = {
  /** `useLastSeal()` jarId, or null. */
  sealJarId: string | null;
  /** null until the played list has loaded. */
  played: ReadonlySet<string> | null;
  /** A drop is mid-flight (fold, compose dismiss, add, fall, settle). */
  dropBusy: boolean;
  focused: boolean;
  sealing: boolean;
  /** The reveal overlay is open. */
  revealOpen: boolean;
  /** Open jar, for the local trigger. Omit to wait for the server only. */
  openJar?: OpenJarView | null;
};

/** True once the seal for this jar has played, locally or from the server. */
export function isSealPlayed(played: ReadonlySet<string>, jarId: string): boolean {
  return played.has(jarId) || played.has(localSealKey(jarId));
}

/** The local trigger: the open jar has reached capacity and has not sealed here yet. */
export function localSealId(played: ReadonlySet<string> | null, jar?: OpenJarView | null): string | null {
  if (!played || !jar || jar.jarId === 'optimistic' || jar.capacity <= 0) return null;
  if (jar.noteCount + jar.pendingCount < jar.capacity) return null;
  return isSealPlayed(played, jar.jarId) ? null : localSealKey(jar.jarId);
}

/** The seal that is waiting to play, ignoring whether Home is ready for it. Server id wins; else the local one. */
export function pendingSealId(g: Pick<SealGate, 'sealJarId' | 'played' | 'openJar'>): string | null {
  if (!g.played) return null;
  if (g.sealJarId && !isSealPlayed(g.played, g.sealJarId)) return g.sealJarId;
  return localSealId(g.played, g.openJar);
}

/** Plays once per jar, only when Home is focused and idle, never while a drop is mid-flight. */
export function shouldPlaySeal(g: SealGate): string | null {
  const id = pendingSealId(g);
  if (!id || g.dropBusy || !g.focused || g.sealing || g.revealOpen) return null;
  return id;
}
