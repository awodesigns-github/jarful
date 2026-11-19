/**
 * Offline outbox and compose draft. Pure logic over a tiny key-value store so
 * it can be tested without native modules. Production uses expo-secure-store
 * (already in the dev build): one key per pending note, one for the draft and
 * an index key listing pending ids. Values stay small (a note is <= ~700 bytes).
 */
export type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type PendingNote = {
  clientId: string;
  text: string;
  colour?: string;
  createdAt: number;
};

export const DRAFT_KEY = "jarful.draft";
export const INDEX_KEY = "jarful.outbox.index";
const noteKey = (id: string) => `jarful.outbox.note.${id}`;

/** Errors the server will never accept; retrying would loop forever. */
function isPermanent(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  return m.includes("Note is empty") || m.includes("Note is longer than");
}

export function newClientId(now = Date.now(), rand = Math.random) {
  return `${now.toString(36)}-${Math.floor(rand() * 2 ** 32).toString(36)}`;
}

export function createOutbox(store: KeyValueStore) {
  let queue: PendingNote[] = [];
  let inflight = new Set<string>();
  let loaded: Promise<void> | null = null;
  let flushing: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  // Cached so useSyncExternalStore gets a stable snapshot between changes.
  let count = 0;
  const emit = () => {
    count = queue.filter((n) => !inflight.has(n.clientId)).length;
    listeners.forEach((l) => l());
  };
  const saveIndex = () =>
    store.setItem(INDEX_KEY, JSON.stringify(queue.map((n) => n.clientId)));

  function load() {
    loaded ??= (async () => {
      const raw = await store.getItem(INDEX_KEY);
      const ids: string[] = raw ? JSON.parse(raw) : [];
      const found: PendingNote[] = [];
      for (const id of ids) {
        const v = await store.getItem(noteKey(id));
        if (v) found.push(JSON.parse(v));
      }
      // Keep anything enqueued while loading.
      const known = new Set(found.map((n) => n.clientId));
      queue = [...found, ...queue.filter((n) => !known.has(n.clientId))];
      emit();
    })();
    return loaded;
  }

  async function enqueue(note: PendingNote) {
    await load();
    if (queue.some((n) => n.clientId === note.clientId)) return; // dedupe
    queue.push(note);
    // Note first, then index: a crash in between loses nothing.
    await store.setItem(noteKey(note.clientId), JSON.stringify(note));
    await saveIndex();
    emit();
  }

  async function remove(clientId: string) {
    queue = queue.filter((n) => n.clientId !== clientId);
    inflight.delete(clientId);
    await saveIndex();
    await store.removeItem(noteKey(clientId));
    emit();
  }

  /** Send queued notes in order. Stops at the first transient failure. */
  function flush(send: (n: PendingNote) => Promise<unknown>) {
    flushing ??= (async () => {
      try {
        await load();
        for (const note of [...queue]) {
          inflight.add(note.clientId);
          emit();
          try {
            await send(note);
          } catch (e) {
            if (isPermanent(e)) {
              await remove(note.clientId);
              continue;
            }
            inflight.delete(note.clientId);
            emit();
            return;
          }
          await remove(note.clientId);
        }
      } finally {
        flushing = null;
      }
    })();
    return flushing;
  }

  return {
    load,
    enqueue,
    flush,
    getPendingCount: () => count,
    pending: () => [...queue],
    subscribe(l: () => void) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
  };
}

export const draftStore = (store: KeyValueStore) => ({
  read: () => store.getItem(DRAFT_KEY),
  write: (text: string) =>
    text.length === 0 ? store.removeItem(DRAFT_KEY) : store.setItem(DRAFT_KEY, text),
  clear: () => store.removeItem(DRAFT_KEY),
});
