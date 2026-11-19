import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { DEFAULT_CAPACITY } from "./notes";

const SAMPLES: { text: string; colour?: "red" | "yellow" | "green" | "blue" | "pink" | "orange" | "sky" }[] = [
  { text: "Coffee with an old friend in the sun", colour: "yellow" },
  { text: "Finished the book I started in spring", colour: "green" },
  { text: "Mum called just to say hi", colour: "pink" },
  { text: "Walked home the long way and saw the sunset", colour: "orange" },
  { text: "Fixed the thing that had been bugging me all week", colour: "blue" },
  { text: "Rain on the window and a warm cup of tea" },
  { text: "A stranger held the door and smiled", colour: "sky" },
];

/**
 * Dev-only: give a user backdated notes so reveal has something to show.
 * Internal, so only the CLI or dashboard can run it:
 *   npx convex run devSeed:seedPastNotes '{"userId":"..."}'
 */
export const seedPastNotes = internalMutation({
  args: { userId: v.id("users"), count: v.optional(v.number()) },
  returns: v.number(),
  handler: async (ctx, { userId, count }) => {
    const n = Math.min(count ?? 5, SAMPLES.length);
    const now = Date.now();
    // Seed into the user's open (unsealed) jar; start one only if every jar is sealed.
    const jars = await ctx.db
      .query("jars")
      .withIndex("by_userId_startedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);
    const open = jars.find((j) => j.sealedAt === undefined);
    const jarId = open?._id ?? (await ctx.db.insert("jars", { userId, capacity: DEFAULT_CAPACITY, startedAt: now }));
    for (let i = 0; i < n; i++) {
      const { text, colour } = SAMPLES[i];
      await ctx.db.insert("notes", {
        userId,
        jarId,
        text,
        colour,
        createdAt: now - (i + 1) * 86_400_000,
        isFavourite: false,
      });
    }
    return n;
  },
});
