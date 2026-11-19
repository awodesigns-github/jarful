/** Settings shape, defaults and validation. Pure: shared by Convex and the app. */
export type ThemeMode = "system" | "light" | "dark";
export type ReducedMotionSetting = "system" | "on" | "off";

export type Settings = {
  /** "HH:mm" local 24-hour time, or null when the reminder is off. */
  reminderTime: string | null;
  theme: ThemeMode;
  reducedMotion: ReducedMotionSetting;
  haptics: boolean;
};
/** `reminderTime: null` turns the reminder off. */
export type SettingsPatch = Partial<Settings>;

export const DEFAULT_SETTINGS: Settings = {
  reminderTime: null,
  theme: "system",
  reducedMotion: "system",
  haptics: true,
};

const REMINDER_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isValidReminderTime = (t: string) => REMINDER_RE.test(t);

/** Throws on a bad patch. Used by the server; the client calls it too so bad input fails early. */
export function assertValidPatch(p: SettingsPatch) {
  if (typeof p.reminderTime === "string" && !isValidReminderTime(p.reminderTime)) {
    throw new Error("Reminder time must be HH:mm (00:00 to 23:59)");
  }
  if (p.theme !== undefined && !["system", "light", "dark"].includes(p.theme)) {
    throw new Error("Theme must be system, light or dark");
  }
  if (p.reducedMotion !== undefined && !["system", "on", "off"].includes(p.reducedMotion)) {
    throw new Error("Reduced motion must be system, on or off");
  }
}

type Row = {
  reminderTime?: string;
  theme?: ThemeMode;
  reducedMotion?: boolean | ReducedMotionSetting;
  haptics?: boolean;
};

/** Stored row (or null) to full settings. Legacy boolean reducedMotion: true -> "on", false -> "system". */
export function normalizeSettings(row: Row | null | undefined): Settings {
  if (!row) return { ...DEFAULT_SETTINGS };
  const rm = row.reducedMotion;
  return {
    reminderTime: row.reminderTime ?? null,
    theme: row.theme ?? "system",
    reducedMotion: rm === true ? "on" : rm === false || rm === undefined ? "system" : rm,
    haptics: row.haptics ?? true,
  };
}
