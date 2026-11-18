// Throwaway M0 functions. Replaced by the real notes API in M2.
import { mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { isNoteTooLong, NOTE_MAX } from "../lib/data/noteText";

export const DEFAULT_CAPACITY = 30;

async function requireUserId(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Not signed in");
  return userId;
}

export const saveTestNote = mutation({
  args: { text: v.string() },
  returns: v.id("notes"),
  handler: async (ctx, { text }) => {
    const userId = await requireUserId(ctx);
    const trimmed = text.trim();
    if (trimmed.length === 0) throw new Error("Note is empty");
    if (isNoteTooLong(trimmed)) {
      throw new Error(`Note is longer than ${NOTE_MAX} characters`);
    }
    const now = Date.now();
    const jar = await ctx.db
      .query("jars")
      .withIndex("by_userId_startedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
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
      createdAt: now,
      isFavourite: false,
    });
  },
});

export const listTestNotes = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await ctx.db
      .query("notes")
      .withIndex("by_userId_createdAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);
  },
});
