import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { useSettings } from '@/lib/data';
import { darkTheme, lightTheme, type Theme } from './tokens';

export type ThemeMode = 'system' | 'light' | 'dark';

type Ctx = { theme: Theme; scheme: 'light' | 'dark'; mode: ThemeMode };

const ThemeContext = createContext<Ctx | null>(null);

// Mode follows settings.theme (cached, so it is right on the first frame). System follows the phone live.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const mode: ThemeMode = useSettings().theme;
  const scheme: 'light' | 'dark' = mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;
  const value = useMemo<Ctx>(
    () => ({ theme: scheme === 'dark' ? darkTheme : lightTheme, scheme, mode }),
    [scheme, mode],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Ctx {
  const c = useContext(ThemeContext);
  if (!c) throw new Error('useTheme must be used inside ThemeProvider');
  return c;
}
