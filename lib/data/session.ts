import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";

/**
 * Who is signed in on this device, and the state of a pending anonymous-data
 * merge. Plain module state (no Convex) so the outbox and hooks can share it.
 */
const kv = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
};

export const LAST_USER_KEY = "jarful.session.userId";
export const PENDING_MERGE_KEY = "jarful.merge.pending";

export type PendingMerge = { token: string; sourceUserId: string; createdAt: number };
export type MergeStatus =
  | { state: "idle" }
  | { state: "merging" }
  | { state: "merged"; notes: number }
  | { state: "failed"; reason: "expired" | "invalid" | "other" };

let current: string | undefined; // the user signed in right now, undefined = not known
let lastKnown: string | null = null; // survives restarts, for notes written offline
let mergeStatus: MergeStatus = { state: "idle" };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

void kv.getItem(LAST_USER_KEY).then(
  (v) => {
    lastKnown ??= v;
  },
  () => {},
);

export const session = {
  /** Owner to stamp on a new note: the signed-in user, else the last one seen on this device. */
  owner: (): string | null => current ?? lastKnown,
  current: () => current,
  setUser(id: string | undefined) {
    if (current === id) return;
    current = id;
    if (id !== undefined) {
      lastKnown = id;
      void kv.setItem(LAST_USER_KEY, id).catch(() => {});
    }
    emit();
  },
  async forget() {
    current = undefined;
    lastKnown = null;
    await kv.removeItem(LAST_USER_KEY).catch(() => {});
    emit();
  },
  getMergeStatus: () => mergeStatus,
  setMergeStatus(s: MergeStatus) {
    mergeStatus = s;
    emit();
  },
  async readPendingMerge(): Promise<PendingMerge | null> {
    try {
      const raw = await kv.getItem(PENDING_MERGE_KEY);
      return raw ? (JSON.parse(raw) as PendingMerge) : null;
    } catch {
      return null;
    }
  },
  writePendingMerge: (m: PendingMerge) => kv.setItem(PENDING_MERGE_KEY, JSON.stringify(m)),
  clearPendingMerge: () => kv.removeItem(PENDING_MERGE_KEY).catch(() => {}),
};

export const useSessionUserId = () => useSyncExternalStore(subscribe, session.current, session.current);
/** For the UI: "idle" | "merging" | "merged" (with the note count) | "failed". */
export const useMergeStatus = () => useSyncExternalStore(subscribe, session.getMergeStatus, session.getMergeStatus);
