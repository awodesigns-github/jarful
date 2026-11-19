import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { assertValidPatch, normalizeSettings, type Settings } from "../lib/data/settingsShape";

const patchArgs = {
  // null clears the reminder.
  reminderTime: v.optional(v.union(v.string(), v.null())),
  theme: v.optional(v.union(v.literal("system"), v.literal("light"), v.literal("dark"))),
  reducedMotion: v.optional(v.union(v.literal("system"), v.literal("on"), v.literal("off"))),
  haptics: v.optional(v.boolean()),
};

/** The user's settings, defaults filled in when there is no row. Never inserts. */
export const getSettings = query({
  args: {},
  handler: async (ctx): Promise<Settings> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const row = await ctx.db
      .query("settings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    return normalizeSettings(row);
  },
});

/** Partial update (last write wins). Creates the row if missing. Returns the new settings. */
export const updateSettings = mutation({
  args: patchArgs,
  handler: async (ctx, patch): Promise<Settings> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    assertValidPatch(patch as never);
    const row = await ctx.db
      .query("settings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const { reminderTime, ...rest } = patch;
    const fields: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(rest)) if (val !== undefined) fields[k] = val;
    if (row) {
      // reminderTime: undefined in a patch removes the field in Convex.
      await ctx.db.patch(row._id, {
        ...fields,
        ...(reminderTime === undefined ? {} : { reminderTime: reminderTime ?? undefined }),
        // Normalise a legacy boolean even when untouched.
        ...(fields.reducedMotion === undefined ? { reducedMotion: normalizeSettings(row).reducedMotion } : {}),
      });
    } else {
      await ctx.db.insert("settings", {
        userId,
        theme: "system",
        reducedMotion: "system",
        haptics: true,
        ...fields,
        ...(typeof reminderTime === "string" ? { reminderTime } : {}),
      });
    }
    const after = await ctx.db
      .query("settings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    return normalizeSettings(after);
  },
});
