/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.ts');

function makeT() {
  return convexTest(schema, modules);
}
async function asUser(t: ReturnType<typeof makeT>, name: string) {
  const userId = await t.run(async (ctx) => ctx.db.insert('users', { name }));
  return { userId, as: t.withIdentity({ subject: `${userId}|session-${name}` }) };
}

describe('addNote', () => {
  it('rejects an unauthenticated call', async () => {
    const t = makeT();
    await expect(t.mutation(api.notes.addNote, { text: 'hi' })).rejects.toThrow('Not signed in');
    await expect(t.query(api.notes.getCurrentJar, {})).rejects.toThrow('Not signed in');
  });

  it('creates a jar of capacity 30 on the first note', async () => {
    const t = makeT();
    const { as, userId } = await asUser(t, 'A');
    expect(await as.query(api.notes.getCurrentJar, {})).toBeNull();
    await as.mutation(api.notes.addNote, { text: 'Sunny walk', colour: 'sky' });
    const jar = await as.query(api.notes.getCurrentJar, {});
    expect(jar).toMatchObject({ capacity: 30, noteCount: 1 });
    const notes = await t.run(async (ctx) =>
      ctx.db.query('notes').withIndex('by_userId_createdAt', (q) => q.eq('userId', userId)).collect(),
    );
    expect(notes[0]).toMatchObject({ text: 'Sunny walk', colour: 'sky', isFavourite: false });
  });

  it('puts a second note in the same jar', async () => {
    const t = makeT();
    const { as } = await asUser(t, 'A');
    await as.mutation(api.notes.addNote, { text: 'one' });
    const first = await as.query(api.notes.getCurrentJar, {});
    await as.mutation(api.notes.addNote, { text: 'two' });
    const second = await as.query(api.notes.getCurrentJar, {});
    expect(second?.jarId).toBe(first?.jarId);
    expect(second?.noteCount).toBe(2);
    expect(await t.run(async (ctx) => (await ctx.db.query('jars').collect()).length)).toBe(1);
  });

  it('rejects 141 graphemes, accepts 140 and counts emoji as one', async () => {
    const t = makeT();
    const { as } = await asUser(t, 'A');
    await expect(as.mutation(api.notes.addNote, { text: 'a'.repeat(141) })).rejects.toThrow(/140/);
    await expect(as.mutation(api.notes.addNote, { text: 'a'.repeat(140) })).resolves.toBeTruthy();
    await expect(as.mutation(api.notes.addNote, { text: '👍🏽'.repeat(140) })).resolves.toBeTruthy();
    await expect(as.mutation(api.notes.addNote, { text: '   ' })).rejects.toThrow('empty');
  });

  it('keeps users isolated', async () => {
    const t = makeT();
    const a = await asUser(t, 'A');
    const b = await asUser(t, 'B');
    await a.as.mutation(api.notes.addNote, { text: 'mine' });
    expect(await b.as.query(api.notes.getCurrentJar, {})).toBeNull();
    await b.as.mutation(api.notes.addNote, { text: 'theirs' });
    const ja = await a.as.query(api.notes.getCurrentJar, {});
    const jb = await b.as.query(api.notes.getCurrentJar, {});
    expect(ja?.jarId).not.toBe(jb?.jarId);
    expect(ja?.noteCount).toBe(1);
    expect(jb?.noteCount).toBe(1);
  });

  it('counts notes correctly, and does not block the 31st (sealing is M3)', async () => {
    const t = makeT();
    const { as } = await asUser(t, 'A');
    for (let i = 0; i < 31; i++) await as.mutation(api.notes.addNote, { text: `n${i}` });
    const jar = await as.query(api.notes.getCurrentJar, {});
    expect(jar?.capacity).toBe(30);
    expect(jar?.noteCount).toBe(31);
  });
});

describe('addNote idempotency', () => {
  it('returns the same note for the same clientId', async () => {
    const t = makeT();
    const { as } = await asUser(t, 'A');
    const a = await as.mutation(api.notes.addNote, { text: 'once', clientId: 'c1' });
    const b = await as.mutation(api.notes.addNote, { text: 'once', clientId: 'c1' });
    expect(b).toBe(a);
    expect((await as.query(api.notes.getCurrentJar, {}))?.noteCount).toBe(1);
  });

  it('keeps users with the same clientId separate', async () => {
    const t = makeT();
    const u1 = await asUser(t, 'A');
    const u2 = await asUser(t, 'B');
    const a = await u1.as.mutation(api.notes.addNote, { text: 'a', clientId: 'same' });
    const b = await u2.as.mutation(api.notes.addNote, { text: 'b', clientId: 'same' });
    expect(a).not.toBe(b);
    expect((await u1.as.query(api.notes.getCurrentJar, {}))?.noteCount).toBe(1);
    expect((await u2.as.query(api.notes.getCurrentJar, {}))?.noteCount).toBe(1);
  });

  it('keeps the device write time, never in the future', async () => {
    const t = makeT();
    const { as, userId } = await asUser(t, 'A');
    await as.mutation(api.notes.addNote, { text: 'old', createdAt: 1000 });
    await as.mutation(api.notes.addNote, { text: 'future', createdAt: Date.now() + 1e9 });
    const notes = await t.run(async (ctx) =>
      ctx.db.query('notes').withIndex('by_userId_createdAt', (q) => q.eq('userId', userId)).collect(),
    );
    expect(notes[0].createdAt).toBe(1000);
    expect(notes[1].createdAt).toBeLessThanOrEqual(Date.now());
  });
});

describe('revealNote and setFavourite', () => {
  const DAY = 86_400_000;
  const dayStart = 10 * DAY;
  async function seed(t: ReturnType<typeof makeT>, userId: any, rows: { text: string; createdAt: number; sealed?: boolean }[]) {
    return t.run(async (ctx) => {
      const ids: any[] = [];
      for (const r of rows) {
        const jarId = await ctx.db.insert('jars', {
          userId, capacity: 30, startedAt: r.createdAt, ...(r.sealed ? { sealedAt: r.createdAt + 1 } : {}),
        });
        ids.push(await ctx.db.insert('notes', { userId, jarId, text: r.text, createdAt: r.createdAt, isFavourite: false }));
      }
      return ids;
    });
  }

  it('rejects unauthenticated calls', async () => {
    const t = makeT();
    await expect(t.mutation(api.notes.revealNote, { dayStart })).rejects.toThrow('Not signed in');
    const { as, userId } = await asUser(t, 'A');
    const [id] = await seed(t, userId, [{ text: 'x', createdAt: 1 }]);
    await expect(t.mutation(api.notes.setFavourite, { noteId: id, isFavourite: true })).rejects.toThrow('Not signed in');
    expect(as).toBeDefined();
  });

  it('returns none-yet with no notes, and never reveals today', async () => {
    const t = makeT();
    const { as, userId } = await asUser(t, 'A');
    expect(await as.mutation(api.notes.revealNote, { dayStart })).toEqual({ reason: 'none-yet' });
    await seed(t, userId, [{ text: 'today', createdAt: dayStart + 5 }]);
    expect(await as.mutation(api.notes.revealNote, { dayStart })).toEqual({ reason: 'none-yet' });
  });

  it('returns a single eligible note every time, and stores it in settings', async () => {
    const t = makeT();
    const { as, userId } = await asUser(t, 'A');
    const [id] = await seed(t, userId, [{ text: 'old', createdAt: dayStart - 5 }, { text: 'today', createdAt: dayStart }]).then((x) => x);
    for (let i = 0; i < 3; i++) {
      expect(await as.mutation(api.notes.revealNote, { dayStart })).toMatchObject({ _id: id, text: 'old', colour: null });
    }
    const s = await t.run(async (ctx) => ctx.db.query('settings').collect());
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ userId, lastRevealedNoteId: id, haptics: true, theme: 'system' });
  });

  it('does not repeat the last note and draws from sealed jars', async () => {
    const t = makeT();
    const { as, userId } = await asUser(t, 'A');
    await seed(t, userId, [
      { text: 'a', createdAt: 1, sealed: true },
      { text: 'b', createdAt: 2, sealed: true },
      { text: 'c', createdAt: 3 },
    ]);
    const seen = new Set<string>();
    let prev = '';
    for (let i = 0; i < 25; i++) {
      const r: any = await as.mutation(api.notes.revealNote, { dayStart });
      expect(r.text).not.toBe(prev);
      prev = r.text;
      seen.add(r.text);
    }
    expect(seen).toEqual(new Set(['a', 'b', 'c']));
  });

  it('setFavourite is owner-only and does not leak existence', async () => {
    const t = makeT();
    const a = await asUser(t, 'A');
    const b = await asUser(t, 'B');
    const [id] = await seed(t, a.userId, [{ text: 'mine', createdAt: 1 }]);
    await expect(b.as.mutation(api.notes.setFavourite, { noteId: id, isFavourite: true })).rejects.toThrow('Note not found');
    await a.as.mutation(api.notes.setFavourite, { noteId: id, isFavourite: true });
    const n = await t.run(async (ctx) => ctx.db.get(id));
    expect((n as any).isFavourite).toBe(true);
  });

  it('isolates users on reveal', async () => {
    const t = makeT();
    const a = await asUser(t, 'A');
    const b = await asUser(t, 'B');
    await seed(t, a.userId, [{ text: 'secret', createdAt: 1 }]);
    expect(await b.as.mutation(api.notes.revealNote, { dayStart })).toEqual({ reason: 'none-yet' });
  });

  it('getCurrentJar returns note colours in order', async () => {
    const t = makeT();
    const { as } = await asUser(t, 'A');
    await as.mutation(api.notes.addNote, { text: 'one', colour: 'sky' });
    await as.mutation(api.notes.addNote, { text: 'two' });
    expect(await as.query(api.notes.getCurrentJar, {})).toMatchObject({ colours: ['sky', null] });
  });
});
