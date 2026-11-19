import { mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { isNoteTooLong, NOTE_MAX } from "../lib/data/noteText";

export const DEFAULT_CAPACITY = 30;

/** Mood colour token names (theme/tokens.ts `mood`). Colours live in the UI. */
export const moodColour = v.union(
  v.literal("red"),
  v.literal("yellow"),
  v.literal("green"),
  v.literal("blue"),
  v.literal("pink"),
  v.literal("orange"),
  v.literal("sky"),
);

async function requireUserId(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Not signed in");
  return userId;
}

async function currentJar(ctx: QueryCtx, userId: Awaited<ReturnType<typeof requireUserId>>) {
  const jar = await ctx.db
    .query("jars")
    .withIndex("by_userId_startedAt", (q) => q.eq("userId", userId))
    .order("desc")
    .first();
  return jar && jar.sealedAt === undefined ? jar : null;
}

export const addNote = mutation({
  args: {
    text: v.string(),
    colour: v.optional(moodColour),
    clientId: v.optional(v.string()),
    createdAt: v.optional(v.number()), // when it was written on the device
  },
  returns: v.object({ noteId: v.id("notes"), sealedJarId: v.optional(v.id("jars")) }),
  handler: async (ctx, { text, colour, clientId, createdAt }) => {
    const userId = await requireUserId(ctx);
    if (clientId !== undefined) {
      if (clientId.length === 0 || clientId.length > 64) throw new Error("Bad clientId");
      const existing = await ctx.db
        .query("notes")
        .withIndex("by_userId_clientId", (q) => q.eq("userId", userId).eq("clientId", clientId))
        .first();
      if (existing) return { noteId: existing._id }; // a retry after a lost response
    }
    const trimmed = text.trim();
    if (trimmed.length === 0) throw new Error("Note is empty");
    if (isNoteTooLong(trimmed)) {
      throw new Error(`Note is longer than ${NOTE_MAX} characters`);
    }
    const now = Date.now();
    const writtenAt = createdAt === undefined ? now : Math.min(createdAt, now);
    let jar = await currentJar(ctx, userId);
    let count = 0;
    if (jar) {
      count = await countNotes(ctx, jar._id, jar.capacity);
      if (count >= jar.capacity) {
        // An over-full open jar (notes saved before sealing existed): seal it first.
        await ctx.db.patch(jar._id, { sealedAt: now });
        jar = null;
        count = 0;
      }
    }
    const jarId =
      jar?._id ??
      (await ctx.db.insert("jars", { userId, capacity: DEFAULT_CAPACITY, startedAt: now }));
    const capacity = jar?.capacity ?? DEFAULT_CAPACITY;
    const noteId = await ctx.db.insert("notes", {
      userId,
      jarId,
      text: trimmed,
      colour,
      createdAt: writtenAt,
      isFavourite: false,
      clientId,
    });
    if (count + 1 >= capacity) {
      await ctx.db.patch(jarId, { sealedAt: now });
      return { noteId, sealedJarId: jarId };
    }
    return { noteId };
  },
});

async function countNotes(ctx: QueryCtx, jarId: Id<"jars">, capacity: number) {
  const rows = await ctx.db
    .query("notes")
    .withIndex("by_jarId_createdAt", (q) => q.eq("jarId", jarId))
    .take(capacity + 1);
  return rows.length;
}

/**
 * The seal signal. Non-null while the newest jar is sealed and no fresh jar has
 * started (the state right after the 30th note). The UI plays the seal moment
 * when `jarId` differs from the one it last showed.
 */
export const getLastSeal = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const jar = await ctx.db
      .query("jars")
      .withIndex("by_userId_startedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
    if (!jar || jar.sealedAt === undefined) return null;
    return { jarId: jar._id, sealedAt: jar.sealedAt };
  },
});

const noteView = (n: Doc<"notes">) => ({
  _id: n._id,
  jarId: n.jarId,
  text: n.text,
  colour: n.colour ?? null,
  createdAt: n.createdAt,
  isFavourite: n.isFavourite,
  clientId: n.clientId ?? null,
});

/** All the user's notes, any jar, newest first. Paginate with usePaginatedQuery. */
export const listArchive = query({
  args: { favouritesOnly: v.optional(v.boolean()), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { favouritesOnly, paginationOpts }) => {
    const userId = await requireUserId(ctx);
    const q = favouritesOnly
      ? ctx.db
          .query("notes")
          .withIndex("by_userId_isFavourite", (i) => i.eq("userId", userId).eq("isFavourite", true))
      : ctx.db.query("notes").withIndex("by_userId_createdAt", (i) => i.eq("userId", userId));
    const page = await q.order("desc").paginate(paginationOpts);
    return { ...page, page: page.page.map(noteView) };
  },
});

/** Sealed jars, newest first, with their note colours (oldest first) for drawing. */
export const listShelf = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const jars = await ctx.db
      .query("jars")
      .withIndex("by_userId_startedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    const sealed = jars.filter((j) => j.sealedAt !== undefined);
    return await Promise.all(
      sealed.map(async (j) => {
        const notes = await ctx.db
          .query("notes")
          .withIndex("by_jarId_createdAt", (q) => q.eq("jarId", j._id))
          .take(j.capacity + 1);
        return {
          jarId: j._id,
          name: j.name ?? null,
          startedAt: j.startedAt,
          sealedAt: j.sealedAt as number,
          capacity: j.capacity,
          noteCount: notes.length,
          colours: notes.map((n) => n.colour ?? null),
        };
      }),
    );
  },
});

/** One jar's notes, newest first. Owner only; another user's jar looks like a missing one. */
export const listJarNotes = query({
  args: { jarId: v.id("jars") },
  handler: async (ctx, { jarId }) => {
    const userId = await requireUserId(ctx);
    const jar = await ctx.db.get(jarId);
    if (jar === null || jar.userId !== userId) throw new Error("Jar not found");
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_jarId_createdAt", (q) => q.eq("jarId", jarId))
      .order("desc")
      .take(jar.capacity + 1);
    return notes.map(noteView);
  },
});

/** The user's open jar with its note count, or null before the first note. */
export const getCurrentJar = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const jar = await currentJar(ctx, userId);
    if (jar === null) return null;
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_jarId_createdAt", (q) => q.eq("jarId", jar._id))
      .take(jar.capacity + 1);
    return {
      jarId: jar._id,
      capacity: jar.capacity,
      noteCount: notes.length,
      // Oldest first, one entry per slip; null = no mood colour.
      colours: notes.slice(0, jar.capacity).map((n) => n.colour ?? null),
    };
  },
});

const REVEAL_POOL = 300; // v1: newest 300 eligible notes. Scale plan in the handoff.

export type RevealResult =
  | { reason: "none-yet" }
  | {
      _id: Id<"notes">;
      text: string;
      colour: string | null;
      createdAt: number;
      isFavourite: boolean;
    };

/**
 * A random past note from any jar. Excludes notes written today (createdAt >=
 * dayStart, the client's local midnight) and the one shown last time, unless
 * it is the only choice. A mutation, so the pick is never cached.
 */
export const revealNote = mutation({
  args: { dayStart: v.number() },
  handler: async (ctx, { dayStart }): Promise<RevealResult> => {
    const userId = await requireUserId(ctx);
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const pool = await ctx.db
      .query("notes")
      .withIndex("by_userId_createdAt", (q) => q.eq("userId", userId).lt("createdAt", dayStart))
      .order("desc")
      .take(REVEAL_POOL);
    if (pool.length === 0) return { reason: "none-yet" };
    const last = settings?.lastRevealedNoteId;
    const others = pool.filter((n) => n._id !== last);
    const choices = others.length > 0 ? others : pool;
    const note = choices[Math.min(choices.length - 1, Math.floor(Math.random() * choices.length))];
    if (settings) {
      await ctx.db.patch(settings._id, { lastRevealedNoteId: note._id });
    } else {
      await ctx.db.insert("settings", {
        userId,
        theme: "system",
        reducedMotion: false,
        haptics: true,
        lastRevealedNoteId: note._id,
      });
    }
    return {
      _id: note._id,
      text: note.text,
      colour: note.colour ?? null,
      createdAt: note.createdAt,
      isFavourite: note.isFavourite,
    };
  },
});

export const setFavourite = mutation({
  args: { noteId: v.id("notes"), isFavourite: v.boolean() },
  handler: async (ctx, { noteId, isFavourite }) => {
    const userId = await requireUserId(ctx);
    const note = await ctx.db.get(noteId);
    if (note === null || note.userId !== userId) throw new Error("Note not found");
    await ctx.db.patch(noteId, { isFavourite });
  },
});
