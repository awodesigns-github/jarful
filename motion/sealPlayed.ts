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
};

/** The seal that is waiting to play, ignoring whether Home is ready for it. */
export function pendingSealId(g: Pick<SealGate, 'sealJarId' | 'played'>): string | null {
  if (!g.sealJarId || !g.played) return null;
  return g.played.has(g.sealJarId) ? null : g.sealJarId;
}

/** Plays once per jar, only when Home is focused and idle, never while a drop is mid-flight. */
export function shouldPlaySeal(g: SealGate): string | null {
  const id = pendingSealId(g);
  if (!id || g.dropBusy || !g.focused || g.sealing || g.revealOpen) return null;
  return id;
}
