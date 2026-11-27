// Rive drop-in helpers: the scene must land where the home jar shows the next slip, in the
// note's own colours (docs/decisions.md 2026-11-27).
import { jarSlots, landingSlot, mixHex, noteColours, slipColours } from '@/components/jar/riveNoteDrop';
import { NEUTRAL_SLIP, SLIPS } from '@/components/jar/slips';
import { mood } from '@/theme';

const light = { bgSurface: '#ffffff', borderSubtle: '#e6dccb', textPrimary: '#2e2a26' };

describe('jarSlots (same rounding as Jar.tsx)', () => {
  it('counts one slip per note for a 30-note jar', () => {
    expect(jarSlots(0, 30)).toBe(0);
    expect(jarSlots(7, 30)).toBe(7);
    expect(jarSlots(30, 30)).toBe(30);
  });
  it('never shows more than a full jar', () => {
    expect(jarSlots(31, 30)).toBe(30);
  });
});

describe('landingSlot', () => {
  it('lands the first note on the first slip, at its centre and angle', () => {
    const s = landingSlot(0, 30);
    expect(s.index).toBe(0);
    expect(s.x).toBeCloseTo(41.96, 1);
    expect(s.y).toBeCloseTo(320.25, 1);
    expect(s.rot).toBeCloseTo((SLIPS[0].rot * Math.PI) / 180, 5);
  });
  it('lands the next note on the next slip', () => {
    expect(landingSlot(18, 30).index).toBe(18);
  });
  it('lands on the top slip when the jar is already full', () => {
    expect(landingSlot(30, 30).index).toBe(29);
  });
});

describe('note colours', () => {
  it('tints the card with about 18% of the mood colour, like compose', () => {
    expect(mixHex('#ffffff', mood.pink, 0.18)).toBe('#fde3ed');
    const c = noteColours(mood.pink, light);
    expect(c).toEqual({ colour: mood.pink, tint: '#fde3ed', border: mood.pink, ink: light.textPrimary });
  });
  it('uses the neutral slip and a plain card when no mood colour was picked', () => {
    expect(noteColours(undefined, light)).toEqual({
      colour: NEUTRAL_SLIP,
      tint: light.bgSurface,
      border: light.borderSubtle,
      ink: light.textPrimary,
    });
  });
});

describe('slipColours', () => {
  it('paints each slip in its note colour, neutral when it has none', () => {
    const c = slipColours(['pink', null, 'nope'], mood);
    expect(c).toHaveLength(36);
    expect(c.slice(0, 3)).toEqual([mood.pink, NEUTRAL_SLIP, NEUTRAL_SLIP]);
  });
  it('uses the artwork colours when the jar has no colour data', () => {
    expect(slipColours(undefined, mood)[0]).toBe(SLIPS[0].fill);
  });
});
