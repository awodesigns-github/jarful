/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.ts');

// Convex Auth reads identity.subject as "<userId>|<sessionId>". getAuthUserId splits on "|".
async function asUser(t: ReturnType<typeof makeT>, name: string) {
  const userId = await t.run(async (ctx) => ctx.db.insert('users', { name }));
  return { userId, as: t.withIdentity({ subject: `${userId}|session-${name}` }) };
}
function makeT() {
  return convexTest(schema, modules);
}

describe('testNotes auth (US-13, US-14)', () => {
  it('rejects an unauthenticated save', async () => {
    const t = makeT();
    await expect(t.mutation(api.testNotes.saveTestNote, { text: 'hi' })).rejects.toThrow('Not signed in');
  });

  it('rejects an unauthenticated list', async () => {
    const t = makeT();
    await expect(t.query(api.testNotes.listTestNotes, {})).rejects.toThrow('Not signed in');
  });

  it('lets a signed-in user save and list their note', async () => {
    const t = makeT();
    const { as } = await asUser(t, 'A');
    await as.mutation(api.testNotes.saveTestNote, { text: 'Sunny walk' });
    const notes = await as.query(api.testNotes.listTestNotes, {});
    expect(notes.map((n) => n.text)).toEqual(['Sunny walk']);
  });
});

describe('testNotes length limit', () => {
  it('accepts exactly 140 characters', async () => {
    const t = makeT();
    const { as } = await asUser(t, 'A');
    await expect(as.mutation(api.testNotes.saveTestNote, { text: 'a'.repeat(140) })).resolves.toBeTruthy();
  });

  it('rejects 141 characters', async () => {
    const t = makeT();
    const { as } = await asUser(t, 'A');
    await expect(as.mutation(api.testNotes.saveTestNote, { text: 'a'.repeat(141) })).rejects.toThrow(/140/);
  });

  it('rejects empty and whitespace-only text', async () => {
    const t = makeT();
    const { as } = await asUser(t, 'A');
    await expect(as.mutation(api.testNotes.saveTestNote, { text: '' })).rejects.toThrow('empty');
    await expect(as.mutation(api.testNotes.saveTestNote, { text: '   ' })).rejects.toThrow('empty');
  });

  it('measures the trimmed text, so 140 characters plus spaces is fine', async () => {
    const t = makeT();
    const { as } = await asUser(t, 'A');
    await expect(as.mutation(api.testNotes.saveTestNote, { text: `  ${'a'.repeat(140)}  ` })).resolves.toBeTruthy();
  });

  it('stores emoji and non-Latin text', async () => {
    const t = makeT();
    const { as } = await asUser(t, 'A');
    await as.mutation(api.testNotes.saveTestNote, { text: '今日はいい日 🌞' });
    const notes = await as.query(api.testNotes.listTestNotes, {});
    expect(notes[0].text).toBe('今日はいい日 🌞');
  });

  const save = async (text: string) => {
    const t = makeT();
    const { as } = await asUser(t, 'A');
    return as.mutation(api.testNotes.saveTestNote, { text });
  };
  const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}';

  it('counts graphemes: 140 emoji accepted, 141 rejected', async () => {
    await expect(save('\u{1F31E}'.repeat(140))).resolves.toBeTruthy();
    await expect(save('\u{1F31E}'.repeat(141))).rejects.toThrow(/140/);
  });

  it('counts a ZWJ family emoji as 1', async () => {
    await expect(save(family.repeat(140))).resolves.toBeTruthy();
    await expect(save(family.repeat(141))).rejects.toThrow(/140/);
  });

  it('counts a flag as 1', async () => {
    const flag = '\u{1F1EC}\u{1F1E7}';
    await expect(save(flag.repeat(140))).resolves.toBeTruthy();
    await expect(save(flag.repeat(141))).rejects.toThrow(/140/);
  });

  it('counts a skin-tone emoji as 1', async () => {
    const wave = '\u{1F44B}\u{1F3FD}';
    await expect(save(wave.repeat(140))).resolves.toBeTruthy();
    await expect(save(wave.repeat(141))).rejects.toThrow(/140/);
  });

  it('rejects over 2,000 UTF-16 units even when graphemes are 140 or fewer', async () => {
    const huge = 'a' + '\u0301'.repeat(2000); // 1 grapheme, 2001 units
    await expect(save(huge)).rejects.toThrow();
    await expect(save('a' + '\u0301'.repeat(1998))).resolves.toBeTruthy(); // 1999 units, 1 grapheme
  });
});

describe('first jar', () => {
  it('is created with capacity 30 on the first note and reused after', async () => {
    const t = makeT();
    const { as, userId } = await asUser(t, 'A');
    await as.mutation(api.testNotes.saveTestNote, { text: 'one' });
    await as.mutation(api.testNotes.saveTestNote, { text: 'two' });
    const jars = await t.run(async (ctx) => ctx.db.query('jars').collect());
    expect(jars).toHaveLength(1);
    expect(jars[0].capacity).toBe(30);
    expect(jars[0].userId).toBe(userId);
    expect(jars[0].sealedAt).toBeUndefined();
    const notes = await t.run(async (ctx) => ctx.db.query('notes').collect());
    expect(notes.every((n) => n.jarId === jars[0]._id)).toBe(true);
  });

  it('gives each user their own jar', async () => {
    const t = makeT();
    const a = await asUser(t, 'A');
    const b = await asUser(t, 'B');
    await a.as.mutation(api.testNotes.saveTestNote, { text: 'a' });
    await b.as.mutation(api.testNotes.saveTestNote, { text: 'b' });
    const jars = await t.run(async (ctx) => ctx.db.query('jars').collect());
    expect(jars).toHaveLength(2);
    expect(new Set(jars.map((j) => j.userId)).size).toBe(2);
  });
});

describe('privacy (US-14)', () => {
  it("user B cannot see user A's notes", async () => {
    const t = makeT();
    const a = await asUser(t, 'A');
    const b = await asUser(t, 'B');
    await a.as.mutation(api.testNotes.saveTestNote, { text: 'private to A' });
    expect(await b.as.query(api.testNotes.listTestNotes, {})).toEqual([]);
    expect((await a.as.query(api.testNotes.listTestNotes, {})).map((n) => n.text)).toEqual(['private to A']);
  });

  it('lists newest first and caps at 50', async () => {
    const t = makeT();
    const a = await asUser(t, 'A');
    for (let i = 0; i < 52; i++) await a.as.mutation(api.testNotes.saveTestNote, { text: `n${i}` });
    const notes = await a.as.query(api.testNotes.listTestNotes, {});
    expect(notes).toHaveLength(50);
    expect(notes[0].text).toBe('n51');
  });
});
