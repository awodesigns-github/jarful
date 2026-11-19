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
