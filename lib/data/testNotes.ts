// Throwaway M0 hooks. Replaced by the real note hooks in M2.
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/** Newest first. `undefined` while loading. */
export function useTestNotes() {
  return useQuery(api.testNotes.listTestNotes);
}

/** `save(text)` shows the note in `useTestNotes` at once, before the server answers. */
export function useSaveTestNote() {
  const save = useMutation(api.testNotes.saveTestNote).withOptimisticUpdate(
    (store, { text }) => {
      const current = store.getQuery(api.testNotes.listTestNotes, {});
      if (current === undefined) return;
      const now = Date.now();
      store.setQuery(api.testNotes.listTestNotes, {}, [
        {
          _id: `optimistic-${now}` as Id<"notes">,
          _creationTime: now,
          userId: current[0]?.userId ?? ("" as Id<"users">),
          jarId: current[0]?.jarId ?? ("" as Id<"jars">),
          text: text.trim(),
          createdAt: now,
          isFavourite: false,
        },
        ...current,
      ]);
    },
  );
  return save;
}
