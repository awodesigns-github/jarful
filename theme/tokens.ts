// Generated from the Jarful Figma variables (Primitives, Color, Spacing, Radius) and text styles.
// Mood colours are the same in light and dark.

export const palette = {
  'cream/50': '#fbf6ec',
  'cream/100': '#f1e8d8',
  'cream/200': '#e6dccb',
  'stone/300': '#d8d0c2',
  'stone/500': '#6b6257',
  'stone/700': '#4a443d',
  'ink/900': '#2e2a26',
  'white': '#ffffff',
  'clay/500': '#c8755a',
  'night/900': '#221c18',
  'night/800': '#2d2621',
  'night/700': '#3a322c',
  'night/600': '#4a4038',
  'night/text': '#f3ebdd',
  'night/muted': '#a89c8c',
  'mood/red': '#e8432e',
  'mood/yellow': '#f7c31b',
  'mood/green': '#2fa35b',
  'mood/blue': '#2459d6',
  'mood/pink': '#f2629b',
  'mood/orange': '#f58a1f',
  'mood/sky': '#3db8e8',
  'status/red': '#b83a2b',
  'status/red-night': '#f08070',
} as const;

const semantic = (mode: 'light' | 'dark') => ({
  bgBase: mode === 'light' ? palette['cream/50'] : palette['night/900'],
  bgSurface: mode === 'light' ? palette['white'] : palette['night/800'],
  bgSunken: mode === 'light' ? palette['cream/100'] : palette['night/700'],
  bgScrim: mode === 'light' ? palette['ink/900'] : palette['night/900'],
  borderSubtle: mode === 'light' ? palette['cream/200'] : palette['night/600'],
  borderStrong: mode === 'light' ? palette['ink/900'] : palette['night/text'],
  textPrimary: mode === 'light' ? palette['ink/900'] : palette['night/text'],
  textSecondary: mode === 'light' ? palette['stone/500'] : palette['night/muted'],
  textInverse: mode === 'light' ? palette['cream/50'] : palette['night/900'],
  actionPrimary: mode === 'light' ? palette['ink/900'] : palette['night/text'],
  actionOnPrimary: mode === 'light' ? palette['cream/50'] : palette['night/900'],
  jarLine: mode === 'light' ? palette['ink/900'] : palette['night/text'],
  jarGlass: mode === 'light' ? palette['white'] : palette['night/800'],
  accentMuted: mode === 'light' ? palette['clay/500'] : palette['clay/500'],
  statusDestructive: mode === 'light' ? palette['status/red'] : palette['status/red-night'],
});

export const mood = {
  red: palette['mood/red'],
  yellow: palette['mood/yellow'],
  green: palette['mood/green'],
  blue: palette['mood/blue'],
  pink: palette['mood/pink'],
  orange: palette['mood/orange'],
  sky: palette['mood/sky'],
} as const;
export type MoodColour = keyof typeof mood;

export const space = {
  s4: 4,
  s8: 8,
  s12: 12,
  s16: 16,
  s20: 20,
  s24: 24,
  s32: 32,
  s40: 40,
  s48: 48,
  s64: 64,
} as const;

export const radius = {
  sm: 12,
  md: 20,
  lg: 28,
  pill: 999,
} as const;

// fontFamily names match @expo-google-fonts/dm-sans and @expo-google-fonts/shantell-sans
export const type = {
  displayXL: { fontFamily: 'ShantellSans_800ExtraBold', fontSize: 48, lineHeight: 53, letterSpacing: -1 },
  displayL: { fontFamily: 'ShantellSans_800ExtraBold', fontSize: 36, lineHeight: 41, letterSpacing: -0.5 },
  displayM: { fontFamily: 'ShantellSans_800ExtraBold', fontSize: 28, lineHeight: 34, letterSpacing: 0 },
  titleL: { fontFamily: 'DMSans_700Bold', fontSize: 28, lineHeight: 34, letterSpacing: -0.5 },
  titleM: { fontFamily: 'DMSans_700Bold', fontSize: 22, lineHeight: 28, letterSpacing: -0.2 },
  titleS: { fontFamily: 'DMSans_700Bold', fontSize: 18, lineHeight: 23, letterSpacing: 0 },
  noteL: { fontFamily: 'DMSans_500Medium', fontSize: 24, lineHeight: 32, letterSpacing: -0.2 },
  bodyL: { fontFamily: 'DMSans_400Regular', fontSize: 18, lineHeight: 26, letterSpacing: 0 },
  bodyM: { fontFamily: 'DMSans_400Regular', fontSize: 16, lineHeight: 23, letterSpacing: 0 },
  bodyS: { fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 20, letterSpacing: 0 },
  labelL: { fontFamily: 'DMSans_700Bold', fontSize: 17, lineHeight: 20, letterSpacing: 0 },
  labelM: { fontFamily: 'DMSans_600SemiBold', fontSize: 15, lineHeight: 18, letterSpacing: 0 },
  labelS: { fontFamily: 'DMSans_500Medium', fontSize: 13, lineHeight: 16, letterSpacing: 0.2 },
} as const;

export const motion = {
  // From the global interaction rules (G1, G2)
  settleMs: [450, 600],
  reducedMotionFadeMs: 200,
  easing: 'ease-out',
} as const;

export const lightTheme = { colors: { ...semantic('light'), mood }, space, radius, type };
export const darkTheme = { colors: { ...semantic('dark'), mood }, space, radius, type };
export type Theme = typeof lightTheme;
