import { useCallback, useRef } from "react";
import { useConvex, useConvexAuth, useMutation, useQuery } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export const DEFAULT_CAPACITY = 30;
export type MoodName = "red" | "yellow" | "green" | "blue" | "pink" | "orange" | "sky";

/** `undefined` while loading; `null` before the first note (treat as empty jar of capacity 30). */
export function useCurrentJar() {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.notes.getCurrentJar, isAuthenticated ? {} : "skip");
}

/**
 * The seal signal: `{ jarId, sealedAt }` while the newest jar is sealed and no
 * fresh jar has started yet, else null (`undefined` while loading). Play the
 * seal moment when `jarId` changes to a value you have not shown (treat the
 * value present at first load as already shown). Reactive, so it also fires
 * when an offline note syncs and brings the jar to 30.
 */
export function useLastSeal() {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.notes.getLastSeal, isAuthenticated ? {} : "skip");
}

/** Optimistic update: the jar's noteCount goes up at once. */
export function optimisticAddNote(store: OptimisticLocalStore, { text, colour }: { text: string; colour?: MoodName }) {
  const current = store.getQuery(api.notes.getCurrentJar, {});
  if (current === undefined) return; // not loaded yet
  if (text.trim().length === 0) return;
  store.setQuery(
    api.notes.getCurrentJar,
    {},
    current === null
      ? { jarId: "optimistic" as Id<"jars">, capacity: DEFAULT_CAPACITY, noteCount: 1, colours: [colour ?? null] }
      : { ...current, noteCount: current.noteCount + 1, colours: [...current.colours, colour ?? null] },
  );
}

export type RevealedNote = {
  _id: Id<"notes">;
  text: string;
  colour: string | null;
  createdAt: number;
  isFavourite: boolean;
};
export type RevealResult =
  | { status: "ok"; note: RevealedNote }
  | { status: "none-yet" }
  | { status: "offline" };

function localDayStart(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

/** `reveal()` picks a random past note (not today's, not the last shown). Needs the network. */
export function useRevealNote(): () => Promise<RevealResult> {
  const convex = useConvex();
  const { isAuthenticated } = useConvexAuth();
  const authed = useRef(isAuthenticated);
  authed.current = isAuthenticated;
  const reveal = useMutation(api.notes.revealNote);
  const ref = useRef(reveal);
  ref.current = reveal;
  return useCallback(async () => {
    if (!authed.current || !convex.connectionState().isWebSocketConnected) return { status: "offline" };
    try {
      const r = await ref.current({ dayStart: localDayStart() });
      return "reason" in r ? { status: "none-yet" } : { status: "ok", note: r };
    } catch {
      return { status: "offline" };
    }
  }, [convex]);
}

/** `setFavourite(noteId, isFavourite)`. The UI should keep its own copy of the revealed note in step. */
export function useSetFavourite() {
  const mutate = useMutation(api.notes.setFavourite);
  return useCallback(
    (noteId: Id<"notes">, isFavourite: boolean) => mutate({ noteId, isFavourite }),
    [mutate],
  );
}
