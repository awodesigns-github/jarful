import { useQuery } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export const DEFAULT_CAPACITY = 30;
export type MoodName = "red" | "yellow" | "green" | "blue" | "pink" | "orange" | "sky";

/** `undefined` while loading; `null` before the first note (treat as empty jar of capacity 30). */
export function useCurrentJar() {
  return useQuery(api.notes.getCurrentJar);
}

/** Optimistic update: the jar's noteCount goes up at once. */
export function optimisticAddNote(store: OptimisticLocalStore, { text }: { text: string }) {
  const current = store.getQuery(api.notes.getCurrentJar, {});
  if (current === undefined) return; // not loaded yet
  if (text.trim().length === 0) return;
  store.setQuery(
    api.notes.getCurrentJar,
    {},
    current === null
      ? { jarId: "optimistic" as Id<"jars">, capacity: DEFAULT_CAPACITY, noteCount: 1 }
      : { ...current, noteCount: current.noteCount + 1 },
  );
}
