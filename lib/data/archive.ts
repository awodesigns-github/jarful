import { useEffect, useMemo, useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { outbox } from "./offline";

export type ArchiveNote = {
  _id: string; // "pending:<clientId>" while still on the device
  jarId: Id<"jars"> | null;
  text: string;
  colour: string | null;
  createdAt: number;
  isFavourite: boolean;
  pending: boolean;
};
export type MonthGroup = { key: string; year: number; month: number; notes: ArchiveNote[] };

/** Group notes (already newest first) by local-timezone month. Months newest first. */
export function groupByMonth(notes: ArchiveNote[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const n of notes) {
    const d = new Date(n.createdAt);
    const year = d.getFullYear();
    const month = d.getMonth(); // 0-11
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.notes.push(n);
    else groups.push({ key, year, month, notes: [n] });
  }
  return groups;
}

const PAGE = 30;

/**
 * Notes newest first across all jars. Unsent outbox notes lead the list with
 * `pending: true` (not with the favourites filter). `status`:
 * LoadingFirstPage | CanLoadMore | LoadingMore | Exhausted.
 */
export function useArchive({ favouritesOnly = false }: { favouritesOnly?: boolean } = {}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.notes.listArchive,
    { favouritesOnly },
    { initialNumItems: PAGE },
  );
  const [pendingRaw, setPendingRaw] = useState(() => outbox.pending());
  useEffect(() => {
    const sync = () => setPendingRaw(outbox.pending());
    sync();
    return outbox.subscribe(sync);
  }, []);

  const notes = useMemo<ArchiveNote[]>(() => {
    const saved = results.map((n) => ({ ...n, pending: false }));
    if (favouritesOnly) return saved;
    const have = new Set(results.map((n) => n.clientId).filter(Boolean));
    const pending: ArchiveNote[] = pendingRaw
      .filter((p) => !have.has(p.clientId))
      .map((p) => ({
        _id: `pending:${p.clientId}`,
        jarId: null,
        text: p.text,
        colour: p.colour ?? null,
        createdAt: p.createdAt,
        isFavourite: false,
        pending: true,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
    return [...pending, ...saved];
  }, [results, pendingRaw, favouritesOnly]);

  const months = useMemo(() => groupByMonth(notes), [notes]);
  return { notes, months, status, loadMore: () => loadMore(PAGE) };
}

/** Sealed jars, newest first. `undefined` while loading. */
export function useShelf() {
  return useQuery(api.notes.listShelf);
}

/** One jar's notes, newest first. `undefined` while loading; throws "Jar not found" if not yours. */
export function useJarNotes(jarId: Id<"jars">) {
  return useQuery(api.notes.listJarNotes, { jarId });
}
