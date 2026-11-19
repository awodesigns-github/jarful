import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";

/** How long a merge token works. Long enough for an email code or a slow OAuth round trip. */
export const MERGE_TOKEN_TTL_MS = 30 * 60 * 1000;

async function requireUserId(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Not signed in");
  return userId;
}

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Who is signed in: anonymous or an account, with the method and email or name. Null when signed out. */
export const getAccount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (user === null) return null;
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect();
    const provider = accounts.find((a) => a.provider !== "anonymous")?.provider;
    const method: "google" | "email" | null = provider === "google" ? "google" : provider === "resend-otp" ? "email" : null;
    const anonymous = user.isAnonymous === true || method === null;
    return {
      userId,
      kind: anonymous ? ("anonymous" as const) : ("signedIn" as const),
      method: anonymous ? null : method,
      email: anonymous ? null : (user.email ?? null),
      name: anonymous ? null : (user.name ?? null),
    };
  },
});

/**
 * While still anonymous: a random single-use token tied to this user. The
 * device keeps it across sign-in and hands it to mergeAnonymousData afterwards.
 */
export const createMergeToken = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get(userId);
    if (user === null || user.isAnonymous !== true) throw new Error("Only an anonymous user can merge");
    const now = Date.now();
    const old = await ctx.db
      .query("mergeTokens")
      .withIndex("by_sourceUserId", (q) => q.eq("sourceUserId", userId))
      .collect();
    for (const t of old) if (t.usedAt !== undefined || t.expiresAt < now) await ctx.db.delete(t._id);
    const token = randomToken();
    await ctx.db.insert("mergeTokens", {
      sourceUserId: userId,
      tokenHash: await sha256Hex(token),
      expiresAt: now + MERGE_TOKEN_TTL_MS,
    });
    return token;
  },
});

const mergeResult = v.object({
  status: v.union(v.literal("merged"), v.literal("already-merged"), v.literal("same-user")),
  notes: v.number(),
  jars: v.number(),
});

/**
 * After sign-in: move everything the anonymous user owned to the signed-in
 * user, then delete the anonymous user. All or nothing (one transaction), and
 * safe to retry: a second call with the same token by the same user does nothing.
 */
export const mergeAnonymousData = mutation({
  args: { token: v.string() },
  returns: mergeResult,
  handler: async (ctx, { token }) => {
    const targetId = await requireUserId(ctx);
    return await mergeImpl(ctx, targetId, token);
  },
});

async function mergeImpl(ctx: MutationCtx, targetId: Id<"users">, token: string) {
  const hash = await sha256Hex(token);
  const t = await ctx.db
    .query("mergeTokens")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", hash))
    .first();
  if (t === null) throw new Error("Invalid merge token");
  if (t.usedAt !== undefined) {
    if (t.usedByUserId === targetId) return { status: "already-merged" as const, notes: 0, jars: 0 };
    throw new Error("Merge token already used");
  }
  const now = Date.now();
  if (t.expiresAt < now) throw new Error("Merge token expired");
  const sourceId = t.sourceUserId;
  if (sourceId === targetId) return { status: "same-user" as const, notes: 0, jars: 0 };
  const source = await ctx.db.get(sourceId);
  if (source === null) throw new Error("Invalid merge token");
  if (source.isAnonymous !== true) throw new Error("Merge source is not anonymous");
  const target = await ctx.db.get(targetId);
  if (target === null || target.isAnonymous === true) throw new Error("Sign in before merging");

  // Settings: the account's own win; take the reminder time if it has none.
  const srcSettings = await ctx.db
    .query("settings")
    .withIndex("by_userId", (q) => q.eq("userId", sourceId))
    .unique();
  const tgtSettings = await ctx.db
    .query("settings")
    .withIndex("by_userId", (q) => q.eq("userId", targetId))
    .unique();
  if (srcSettings) {
    if (!tgtSettings) {
      await ctx.db.patch(srcSettings._id, { userId: targetId });
    } else {
      if (tgtSettings.reminderTime === undefined && srcSettings.reminderTime !== undefined) {
        await ctx.db.patch(tgtSettings._id, { reminderTime: srcSettings.reminderTime });
      }
      await ctx.db.delete(srcSettings._id);
    }
  }

  // Jars and notes.
  const srcJars = await ctx.db.query("jars").withIndex("by_userId", (q) => q.eq("userId", sourceId)).collect();
  const tgtJars = await ctx.db.query("jars").withIndex("by_userId", (q) => q.eq("userId", targetId)).collect();
  const isOpen = (j: Doc<"jars">) => j.sealedAt === undefined;
  const sealedMoved = srcJars.filter((j) => !isOpen(j));
  const tgtOpen = tgtJars.filter(isOpen).sort((a, b) => b.startedAt - a.startedAt);
  const srcOpen = srcJars.filter(isOpen).sort((a, b) => a.startedAt - b.startedAt);
  let movedNotes = 0;

  const notesOf = (jarId: Id<"jars">) =>
    ctx.db.query("notes").withIndex("by_jarId_createdAt", (q) => q.eq("jarId", jarId)).collect();

  for (const j of sealedMoved) {
    await ctx.db.patch(j._id, { userId: targetId });
    for (const n of await notesOf(j._id)) {
      await ctx.db.patch(n._id, { userId: targetId });
      movedNotes++;
    }
  }
  const sealedStarts = [...tgtJars.filter((j) => !isOpen(j)), ...sealedMoved].map((j) => j.startedAt);

  const openJars = [...tgtOpen, ...srcOpen];
  if (openJars.length > 0) {
    const base = tgtOpen[0] ?? srcOpen[0];
    if (base.userId !== targetId) await ctx.db.patch(base._id, { userId: targetId });
    const pool: Doc<"notes">[] = [];
    for (const j of openJars) pool.push(...(await notesOf(j._id)));
    pool.sort((a, b) => a.createdAt - b.createdAt || a._creationTime - b._creationTime);
    const capacity = base.capacity;
    const chunks: Doc<"notes">[][] = [];
    for (let i = 0; i < pool.length; i += capacity) chunks.push(pool.slice(i, i + capacity));
    if (chunks.length === 0) chunks.push([]);

    let maxStart = Math.max(base.startedAt, ...sealedStarts);
    const jarIds: Id<"jars">[] = [base._id];
    for (let i = 1; i < chunks.length; i++) {
      maxStart += 1;
      jarIds.push(await ctx.db.insert("jars", { userId: targetId, capacity, startedAt: maxStart }));
    }
    for (let i = 0; i < chunks.length; i++) {
      for (const n of chunks[i]) {
        if (n.jarId !== jarIds[i] || n.userId !== targetId) {
          await ctx.db.patch(n._id, { jarId: jarIds[i], userId: targetId });
        }
        movedNotes++;
      }
      const full = chunks[i].length >= capacity;
      if (i < chunks.length - 1 || full) await ctx.db.patch(jarIds[i], { sealedAt: now });
    }
    if (chunks.length === 1) {
      // The open jar must stay the newest jar, or the app would not find it.
      const newest = Math.max(base.startedAt, ...sealedStarts.map((s) => s + 1));
      if (newest !== base.startedAt) await ctx.db.patch(base._id, { startedAt: newest });
    }
    for (const j of openJars) if (j._id !== base._id) await ctx.db.delete(j._id);
  }

  await ctx.db.patch(t._id, { usedAt: now, usedByUserId: targetId });
  await deleteUserRows(ctx, sourceId, { keepTokenId: t._id });
  return { status: "merged" as const, notes: movedNotes, jars: sealedMoved.length + openJars.length };
}

/** Delete the user row and its auth rows, plus tokens. Not notes, jars or settings. */
async function deleteAuthAndUser(ctx: MutationCtx, userId: Id<"users">) {
  const sessions = await ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", userId)).collect();
  for (const s of sessions) {
    const rts = await ctx.db.query("authRefreshTokens").withIndex("sessionId", (q) => q.eq("sessionId", s._id)).collect();
    for (const r of rts) await ctx.db.delete(r._id);
    await ctx.db.delete(s._id);
  }
  const accounts = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
    .collect();
  for (const a of accounts) {
    const codes = await ctx.db.query("authVerificationCodes").withIndex("accountId", (q) => q.eq("accountId", a._id)).collect();
    for (const c of codes) await ctx.db.delete(c._id);
    await ctx.db.delete(a._id);
  }
  const user = await ctx.db.get(userId);
  if (user?.email) {
    const limits = await ctx.db.query("authRateLimits").withIndex("identifier", (q) => q.eq("identifier", user.email!)).collect();
    for (const l of limits) await ctx.db.delete(l._id);
  }
  await ctx.db.delete(userId);
}

async function deleteUserRows(ctx: MutationCtx, userId: Id<"users">, opts: { keepTokenId?: Id<"mergeTokens"> } = {}) {
  const notes = await ctx.db.query("notes").withIndex("by_userId_createdAt", (q) => q.eq("userId", userId)).collect();
  for (const n of notes) await ctx.db.delete(n._id);
  const jars = await ctx.db.query("jars").withIndex("by_userId", (q) => q.eq("userId", userId)).collect();
  for (const j of jars) await ctx.db.delete(j._id);
  const settings = await ctx.db.query("settings").withIndex("by_userId", (q) => q.eq("userId", userId)).collect();
  for (const s of settings) await ctx.db.delete(s._id);
  const tokens = await ctx.db.query("mergeTokens").withIndex("by_sourceUserId", (q) => q.eq("sourceUserId", userId)).collect();
  for (const t of tokens) if (t._id !== opts.keepTokenId) await ctx.db.delete(t._id);
  const used = await ctx.db.query("mergeTokens").withIndex("by_usedByUserId", (q) => q.eq("usedByUserId", userId)).collect();
  for (const t of used) if (t._id !== opts.keepTokenId) await ctx.db.delete(t._id);
  await deleteAuthAndUser(ctx, userId);
}

/** Owner only: removes the caller's notes, jars, settings, merge tokens, auth accounts, sessions, refresh tokens and user row. */
export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    await deleteUserRows(ctx, userId);
    return null;
  },
});
