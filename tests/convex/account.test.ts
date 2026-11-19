/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, it, vi } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';
import { authMethodsFromEnv } from '../../convex/auth';
import { MERGE_TOKEN_TTL_MS } from '../../convex/account';

const modules = import.meta.glob('../../convex/**/*.ts');
const makeT = () => convexTest(schema, modules);
type T = ReturnType<typeof makeT>;

async function mkUser(t: T, name: string, anonymous: boolean) {
  const userId = await t.run(async (ctx) =>
    ctx.db.insert('users', anonymous ? { isAnonymous: true } : { name, email: `${name}@x.test` }),
  );
  return { userId, as: t.withIdentity({ subject: `${userId}|session-${name}` }) };
}

async function addNotes(as: ReturnType<T['withIdentity']>, n: number, prefix: string, start = 0) {
  for (let i = 0; i < n; i++) {
    await as.mutation(api.notes.addNote, { text: `${prefix}${i}`, createdAt: 1000 + start + i });
  }
}

const jarsOf = (t: T, userId: any) =>
  t.run(async (ctx) => ctx.db.query('jars').withIndex('by_userId', (q) => q.eq('userId', userId)).collect());
const notesOf = (t: T, userId: any) =>
  t.run(async (ctx) =>
    ctx.db.query('notes').withIndex('by_userId_createdAt', (q) => q.eq('userId', userId)).collect(),
  );

describe('merge', () => {
  it('moves jars, notes and settings and deletes the anonymous user', async () => {
    const t = makeT();
    const anon = await mkUser(t, 'anon', true);
    const acct = await mkUser(t, 'acct', false);
    await addNotes(anon.as, 30, 'a'); // seals a jar
    await addNotes(anon.as, 4, 'b', 100);
    await anon.as.mutation(api.settings.updateSettings, { reminderTime: '20:30', theme: 'dark' });
    const token = await anon.as.mutation(api.account.createMergeToken, {});
    const res = await acct.as.mutation(api.account.mergeAnonymousData, { token });
    expect(res.status).toBe('merged');
    expect(await notesOf(t, acct.userId)).toHaveLength(34);
    expect((await jarsOf(t, acct.userId)).map((j) => j.sealedAt !== undefined).sort()).toEqual([false, true]);
    expect(await t.run(async (ctx) => ctx.db.get(anon.userId))).toBeNull();
    expect(await jarsOf(t, anon.userId)).toHaveLength(0);
    const s = await acct.as.query(api.settings.getSettings, {});
    expect(s).toMatchObject({ reminderTime: '20:30', theme: 'dark' });
    // The open jar is still found as the current one.
    expect(await acct.as.query(api.notes.getCurrentJar, {})).toMatchObject({ noteCount: 4 });
  });

  it('target settings win but take the reminder when it has none', async () => {
    const t = makeT();
    const anon = await mkUser(t, 'anon', true);
    const acct = await mkUser(t, 'acct', false);
    await anon.as.mutation(api.settings.updateSettings, { reminderTime: '07:00', theme: 'dark' });
    await acct.as.mutation(api.settings.updateSettings, { theme: 'light' });
    const token = await anon.as.mutation(api.account.createMergeToken, {});
    await acct.as.mutation(api.account.mergeAnonymousData, { token });
    expect(await acct.as.query(api.settings.getSettings, {})).toMatchObject({ reminderTime: '07:00', theme: 'light' });
  });

  it('combines open jars in createdAt order and seals at 30 with the rest in a new jar', async () => {
    const t = makeT();
    const anon = await mkUser(t, 'anon', true);
    const acct = await mkUser(t, 'acct', false);
    await addNotes(acct.as, 20, 'acct', 0); // createdAt 1000..1019
    await addNotes(anon.as, 15, 'anon', 10); // interleaved
    const token = await anon.as.mutation(api.account.createMergeToken, {});
    await acct.as.mutation(api.account.mergeAnonymousData, { token });
    const jars = (await jarsOf(t, acct.userId)).sort((a, b) => a.startedAt - b.startedAt);
    expect(jars).toHaveLength(2);
    expect(jars[0].sealedAt).toBeDefined();
    expect(jars[1].sealedAt).toBeUndefined();
    const notes = await notesOf(t, acct.userId);
    expect(notes).toHaveLength(35);
    const inSealed = notes.filter((n) => n.jarId === jars[0]._id);
    expect(inSealed).toHaveLength(30);
    const newestSealed = Math.max(...inSealed.map((n) => n.createdAt));
    const rest = notes.filter((n) => n.jarId === jars[1]._id);
    expect(rest).toHaveLength(5);
    expect(Math.min(...rest.map((n) => n.createdAt))).toBeGreaterThanOrEqual(newestSealed);
    expect(await acct.as.query(api.notes.getCurrentJar, {})).toMatchObject({ noteCount: 5 });
  });

  it('keeps the open jar newest when moved sealed jars are newer', async () => {
    const t = makeT();
    const anon = await mkUser(t, 'anon', true);
    const acct = await mkUser(t, 'acct', false);
    await addNotes(acct.as, 3, 'acct');
    await new Promise((r) => setTimeout(r, 5));
    await addNotes(anon.as, 30, 'anon', 500); // sealed, started later
    const token = await anon.as.mutation(api.account.createMergeToken, {});
    await acct.as.mutation(api.account.mergeAnonymousData, { token });
    expect(await acct.as.query(api.notes.getCurrentJar, {})).toMatchObject({ noteCount: 3 });
    await acct.as.mutation(api.notes.addNote, { text: 'next' });
    expect(await acct.as.query(api.notes.getCurrentJar, {})).toMatchObject({ noteCount: 4 });
  });

  it('keeps clientId duplicates as separate notes', async () => {
    const t = makeT();
    const anon = await mkUser(t, 'anon', true);
    const acct = await mkUser(t, 'acct', false);
    await anon.as.mutation(api.notes.addNote, { text: 'same', clientId: 'c1' });
    await acct.as.mutation(api.notes.addNote, { text: 'same', clientId: 'c1' });
    const token = await anon.as.mutation(api.account.createMergeToken, {});
    await acct.as.mutation(api.account.mergeAnonymousData, { token });
    expect(await notesOf(t, acct.userId)).toHaveLength(2);
  });

  it('is single use, and a retry by the same user does nothing', async () => {
    const t = makeT();
    const anon = await mkUser(t, 'anon', true);
    const acct = await mkUser(t, 'acct', false);
    const other = await mkUser(t, 'other', false);
    await addNotes(anon.as, 3, 'a');
    const token = await anon.as.mutation(api.account.createMergeToken, {});
    await acct.as.mutation(api.account.mergeAnonymousData, { token });
    const again = await acct.as.mutation(api.account.mergeAnonymousData, { token });
    expect(again.status).toBe('already-merged');
    expect(await notesOf(t, acct.userId)).toHaveLength(3);
    await expect(other.as.mutation(api.account.mergeAnonymousData, { token })).rejects.toThrow('already used');
    expect(await notesOf(t, other.userId)).toHaveLength(0);
  });

  it('rejects an expired or unknown token', async () => {
    vi.useFakeTimers();
    try {
      const t = makeT();
      const anon = await mkUser(t, 'anon', true);
      const acct = await mkUser(t, 'acct', false);
      await addNotes(anon.as, 1, 'a');
      const token = await anon.as.mutation(api.account.createMergeToken, {});
      await expect(acct.as.mutation(api.account.mergeAnonymousData, { token: 'nope' })).rejects.toThrow('Invalid');
      vi.setSystemTime(Date.now() + MERGE_TOKEN_TTL_MS + 1000);
      await expect(acct.as.mutation(api.account.mergeAnonymousData, { token })).rejects.toThrow('expired');
      expect(await notesOf(t, anon.userId)).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a token whose source is not anonymous', async () => {
    const t = makeT();
    const real = await mkUser(t, 'real', false);
    const acct = await mkUser(t, 'acct', false);
    await expect(real.as.mutation(api.account.createMergeToken, {})).rejects.toThrow('anonymous');
    // A token that was minted while anonymous, after which the user became a real account.
    const anon = await mkUser(t, 'anon', true);
    const token = await anon.as.mutation(api.account.createMergeToken, {});
    await t.run(async (ctx) => ctx.db.patch(anon.userId, { isAnonymous: false, email: 'a@x.test' }));
    await expect(acct.as.mutation(api.account.mergeAnonymousData, { token })).rejects.toThrow('not anonymous');
  });

  it('refuses to merge into an anonymous user and does not consume the token for the same user', async () => {
    const t = makeT();
    const anon = await mkUser(t, 'anon', true);
    const anon2 = await mkUser(t, 'anon2', true);
    const token = await anon.as.mutation(api.account.createMergeToken, {});
    await expect(anon2.as.mutation(api.account.mergeAnonymousData, { token })).rejects.toThrow('Sign in');
    expect((await anon.as.mutation(api.account.mergeAnonymousData, { token })).status).toBe('same-user');
    expect(await t.run(async (ctx) => ctx.db.get(anon.userId))).not.toBeNull();
  });
});

describe('getAccount', () => {
  it('tells anonymous from signed in', async () => {
    const t = makeT();
    const anon = await mkUser(t, 'anon', true);
    const acct = await mkUser(t, 'acct', false);
    await t.run(async (ctx) =>
      ctx.db.insert('authAccounts', { userId: acct.userId, provider: 'google', providerAccountId: 'g1' }),
    );
    expect(await anon.as.query(api.account.getAccount, {})).toMatchObject({ kind: 'anonymous', email: null });
    expect(await acct.as.query(api.account.getAccount, {})).toMatchObject({
      kind: 'signedIn',
      method: 'google',
      email: 'acct@x.test',
    });
    expect(await t.query(api.account.getAccount, {})).toBeNull();
  });
});

describe('deleteAccount', () => {
  it('removes every row for the user and touches nobody else', async () => {
    const t = makeT();
    const a = await mkUser(t, 'a', false);
    const b = await mkUser(t, 'b', false);
    for (const u of [a, b]) {
      await addNotes(u.as, 31, u === a ? 'a' : 'b');
      await u.as.mutation(api.settings.updateSettings, { theme: 'dark' });
      await t.run(async (ctx) => {
        const sessionId = await ctx.db.insert('authSessions', { userId: u.userId, expirationTime: 9e12 });
        await ctx.db.insert('authRefreshTokens', { sessionId, expirationTime: 9e12 });
        const accountId = await ctx.db.insert('authAccounts', {
          userId: u.userId,
          provider: 'google',
          providerAccountId: `g-${u.userId}`,
        });
        await ctx.db.insert('authVerificationCodes', {
          accountId,
          provider: 'resend-otp',
          code: `c-${u.userId}`,
          expirationTime: 9e12,
        });
      });
    }
    const anon = await mkUser(t, 'anon', true);
    await anon.as.mutation(api.account.createMergeToken, {});
    const token = await anon.as.mutation(api.account.createMergeToken, {});
    await a.as.mutation(api.account.mergeAnonymousData, { token }); // leaves a used token

    await a.as.mutation(api.account.deleteAccount, {});
    const counts = await t.run(async (ctx) => {
      const forA = async (table: any, field: string, id: any) =>
        (await ctx.db.query(table).collect()).filter((r: any) => r[field] === id).length;
      return {
        user: await ctx.db.get(a.userId),
        notes: await forA('notes', 'userId', a.userId),
        jars: await forA('jars', 'userId', a.userId),
        settings: await forA('settings', 'userId', a.userId),
        sessions: await forA('authSessions', 'userId', a.userId),
        accounts: await forA('authAccounts', 'userId', a.userId),
        tokens: await forA('mergeTokens', 'usedByUserId', a.userId),
        allTokens: (await ctx.db.query('mergeTokens').collect()).length,
        refresh: (await ctx.db.query('authRefreshTokens').collect()).length,
        codes: (await ctx.db.query('authVerificationCodes').collect()).length,
      };
    });
    expect(counts).toMatchObject({ user: null, notes: 0, jars: 0, settings: 0, sessions: 0, accounts: 0, tokens: 0, allTokens: 0 });
    expect(counts.refresh).toBe(1);
    expect(counts.codes).toBe(1);
    expect(await notesOf(t, b.userId)).toHaveLength(31);
    expect(await jarsOf(t, b.userId)).toHaveLength(2);
    expect(await b.as.query(api.account.getAccount, {})).not.toBeNull();
  });

  it('requires a signed-in user', async () => {
    await expect(makeT().mutation(api.account.deleteAccount, {})).rejects.toThrow('Not signed in');
  });
});

describe('auth methods', () => {
  it('are unavailable without their env vars', () => {
    expect(authMethodsFromEnv({})).toEqual({ google: false, email: false });
    expect(authMethodsFromEnv({ AUTH_GOOGLE_ID: 'x' })).toMatchObject({ google: false });
    expect(authMethodsFromEnv({ AUTH_RESEND_KEY: 'k' })).toMatchObject({ email: false });
    expect(
      authMethodsFromEnv({ AUTH_GOOGLE_ID: 'i', AUTH_GOOGLE_SECRET: 's', AUTH_RESEND_KEY: 'k', AUTH_RESEND_FROM: 'a@b.c' }),
    ).toEqual({ google: true, email: true });
  });

  it('getAuthMethods reports false in a bare environment', async () => {
    expect(await makeT().query(api.auth.getAuthMethods, {})).toEqual({ google: false, email: false });
  });
});
