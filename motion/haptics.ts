import * as Haptics from 'expo-haptics';

// One place for haptics. The M3 Settings toggle will flip `enabled`.
let enabled = true;
export const setHapticsEnabled = (on: boolean) => {
  enabled = on;
};

/** Light tap for a note landing in the jar. Never the only feedback. */
export function landHaptic(): void {
  if (!enabled) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** A slip reaching the rim during a reveal. */
export function revealHaptic(): void {
  if (!enabled) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Favourite toggled. */
export function selectHaptic(): void {
  if (!enabled) return;
  Haptics.selectionAsync().catch(() => {});
}

/** A very light tick as each crease of the letter fold closes. */
export function creaseHaptic(): void {
  if (!enabled) return;
  Haptics.selectionAsync().catch(() => {});
}

/** The lid seats on a full jar. Fired at the seat, with the visual. */
export function sealHaptic(): void {
  if (!enabled) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
