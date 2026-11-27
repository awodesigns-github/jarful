// Pure helpers for the Rive drop-in (rive/note-drop, assets/rive/note-drop.riv).
// Kept free of React and native imports so Jest can test them directly.
import { JAR_CAPACITY } from './Jar';
import { NEUTRAL_SLIP, SLIPS } from './slips';

/** The Rive artboard: 360 x 580, with the 260 x 320 jar box at (50, 260). */
export const RIVE_ARTBOARD = { width: 360, height: 580, jarX: 50, jarY: 260, jarWidth: 260 } as const;

/** Slips the home jar shows for `total` notes (same rounding as Jar.tsx and DropJar.tsx). */
export function jarSlots(total: number, capacity: number): number {
  const fill = capacity > 0 ? Math.min(1, Math.max(0, total) / capacity) : 0;
  return Math.max(0, Math.min(SLIPS.length, Math.round(fill * JAR_CAPACITY)));
}

export type LandingSlot = { index: number; x: number; y: number; rot: number };

/**
 * Where the new note lands: the slip the home jar will show next. Centre and angle (radians)
 * in slips.ts coordinates. If one more note adds no slip (a full jar), it lands on the top slip.
 */
export function landingSlot(totalBefore: number, capacity: number): LandingSlot {
  const before = jarSlots(totalBefore, capacity);
  const after = jarSlots(totalBefore + 1, capacity);
  const index = after > before ? before : Math.max(0, before - 1);
  const s = SLIPS[Math.min(index, SLIPS.length - 1)];
  const a = (s.rot * Math.PI) / 180;
  // slips.ts gives the 44 x 30 rect's top-left corner, rotated about that corner.
  return {
    index,
    x: s.x + Math.cos(a) * 22 - Math.sin(a) * 15,
    y: s.y + Math.sin(a) * 22 + Math.cos(a) * 15,
    rot: a,
  };
}

/** Mix two #rrggbb colours: `amount` of `over` on `base`. */
export function mixHex(base: string, over: string, amount: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [b, o] = [p(base), p(over)];
  const c = b.map((v, i) => Math.round(v + (o[i] - v) * amount));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** The note as compose shows it: card tint, edge and text; slip colour for the back and the jar. */
export function noteColours(
  moodHex: string | undefined,
  colors: { bgSurface: string; borderSubtle: string; textPrimary: string },
): { colour: string; tint: string; border: string; ink: string } {
  return {
    colour: moodHex ?? NEUTRAL_SLIP,
    tint: moodHex ? mixHex(colors.bgSurface, moodHex, 0.18) : colors.bgSurface,
    border: moodHex ?? colors.borderSubtle,
    ink: colors.textPrimary,
  };
}

/** Each of the 36 slips' colours, painted the way Jar.tsx paints them. */
export function slipColours(colours: (string | null)[] | undefined, mood: Record<string, string>): string[] {
  return SLIPS.map((s, i) => {
    if (!colours) return s.fill;
    const c = colours[i];
    return c && c in mood ? mood[c] : NEUTRAL_SLIP;
  });
}

/** The Rive timeline: the note lands at frame 95 and the scene ends at frame 154 (60 fps). */
export const RIVE_LAND_MS = 1583;
export const RIVE_DONE_MS = 2567;
