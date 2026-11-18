import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { darkTheme, lightTheme, type Theme } from './tokens';

export type ThemeMode = 'system' | 'light' | 'dark';

type Ctx = { theme: Theme; scheme: 'light' | 'dark'; mode: ThemeMode; setMode: (m: ThemeMode) => void };

const ThemeContext = createContext<Ctx | null>(null);

// M0: in-memory mode, defaults to system. The persisted setting arrives later via lib/data.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>('system');
  const scheme: 'light' | 'dark' = mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;
  const value = useMemo<Ctx>(
    () => ({ theme: scheme === 'dark' ? darkTheme : lightTheme, scheme, mode, setMode }),
    [scheme, mode],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Ctx {
  const c = useContext(ThemeContext);
  if (!c) throw new Error('useTheme must be used inside ThemeProvider');
  return c;
}
