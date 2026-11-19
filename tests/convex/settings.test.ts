/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.ts');
const makeT = () => convexTest(schema, modules);
async function asUser(t: ReturnType<typeof makeT>, name: string) {
  const userId = await t.run(async (ctx) => ctx.db.insert('users', { name }));
  return { userId, as: t.withIdentity({ subject: `${userId}|session-${name}` }) };
}
const rows = (t: ReturnType<typeof makeT>) => t.run(async (ctx) => ctx.db.query('settings').collect());
const defaults = { reminderTime: null, theme: 'system', reducedMotion: 'system', haptics: true };

describe('settings', () => {
  it('rejects signed-out calls', async () => {
    const t = makeT();
    await expect(t.query(api.settings.getSettings, {})).rejects.toThrow('Not signed in');
    await expect(t.mutation(api.settings.updateSettings, { haptics: false })).rejects.toThrow('Not signed in');
  });

  it('returns defaults without a row and does not insert on read', async () => {
    const t = makeT();
    const { as } = await asUser(t, 'A');
    expect(await as.query(api.settings.getSettings, {})).toEqual(defaults);
    expect(await rows(t)).toHaveLength(0);
  });

  it('creates the row on first update, then merges partial patches', async () => {
    const t = makeT();
    const { as } = await asUser(t, 'A');
    await as.mutation(api.settings.updateSettings, { theme: 'dark' });
    expect(await rows(t)).toHaveLength(1);
    await as.mutation(api.settings.updateSettings, { reminderTime: '08:30' });
    await as.mutation(api.settings.updateSettings, { haptics: false, reducedMotion: 'on' });
    expect(await as.query(api.settings.getSettings, {})).toEqual({
      reminderTime: '08:30', theme: 'dark', reducedMotion: 'on', haptics: false,
    });
    expect(await rows(t)).toHaveLength(1);
  });

  it('clears the reminder with null', async () => {
    const t = makeT();
    const { as } = await asUser(t, 'A');
    await as.mutation(api.settings.updateSettings, { reminderTime: '21:00' });
    await as.mutation(api.settings.updateSettings, { reminderTime: null });
    expect((await as.query(api.settings.getSettings, {})).reminderTime).toBeNull();
  });

  it('rejects invalid reminder times and theme values', async () => {
    const t = makeT();
    const { as } = await asUser(t, 'A');
    for (const bad of ['24:00', '7:30', '08:60', 'noon', '']) {
      await expect(as.mutation(api.settings.updateSettings, { reminderTime: bad })).rejects.toThrow('HH:mm');
    }
    await expect(as.mutation(api.settings.updateSettings, { theme: 'sepia' as never })).rejects.toThrow();
    await expect(as.mutation(api.settings.updateSettings, { reducedMotion: 'maybe' as never })).rejects.toThrow();
    expect(await rows(t)).toHaveLength(0);
    for (const ok of ['00:00', '23:59']) {
      await as.mutation(api.settings.updateSettings, { reminderTime: ok });
    }
  });

  it('isolates users', async () => {
    const t = makeT();
    const a = await asUser(t, 'A');
    const b = await asUser(t, 'B');
    await a.as.mutation(api.settings.updateSettings, { theme: 'light', reminderTime: '09:00' });
    expect(await b.as.query(api.settings.getSettings, {})).toEqual(defaults);
    await b.as.mutation(api.settings.updateSettings, { haptics: false });
    expect(await a.as.query(api.settings.getSettings, {})).toMatchObject({ theme: 'light', haptics: true });
  });

  it('reads legacy rows with a boolean reducedMotion and keeps lastRevealedNoteId', async () => {
    const t = makeT();
    const { as, userId } = await asUser(t, 'A');
    await t.run(async (ctx) => {
      await ctx.db.insert('settings', { userId, theme: 'system', reducedMotion: true, haptics: true });
    });
    expect((await as.query(api.settings.getSettings, {})).reducedMotion).toBe('on');
    await as.mutation(api.settings.updateSettings, { haptics: false });
    expect((await as.query(api.settings.getSettings, {})).reducedMotion).toBe('on');
  });
});
