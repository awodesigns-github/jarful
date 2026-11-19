import { mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
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
  args: { text: v.string(), colour: v.optional(moodColour) },
  returns: v.id("notes"),
  handler: async (ctx, { text, colour }) => {
    const userId = await requireUserId(ctx);
    const trimmed = text.trim();
    if (trimmed.length === 0) throw new Error("Note is empty");
    if (isNoteTooLong(trimmed)) {
      throw new Error(`Note is longer than ${NOTE_MAX} characters`);
    }
    const now = Date.now();
    // TODO(M3): when this note brings the jar to capacity, set sealedAt and
    // start a new jar. For now the 31st note is accepted into the same jar.
    const jar = await currentJar(ctx, userId);
    const jarId =
      jar?._id ??
      (await ctx.db.insert("jars", {
        userId,
        capacity: DEFAULT_CAPACITY,
        startedAt: now,
      }));
    return await ctx.db.insert("notes", {
      userId,
      jarId,
      text: trimmed,
      colour,
      createdAt: now,
      isFavourite: false,
    });
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
    };
  },
});
