/// <reference types="jest" />
import { renderRouter, screen, fireEvent } from 'expo-router/testing-library';
import { Slot } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme';
import Home from '@/app/index';
import Compose from '@/app/compose';
import Archive from '@/app/archive';
import Settings from '@/app/settings';

const metrics = {
  frame: { x: 0, y: 0, width: 360, height: 800 },
  insets: { top: 24, left: 0, right: 0, bottom: 0 },
};
function Wrapped({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
  );
}

// Regression test for BUG-1: the real Link threw in dev on an array style.
describe('navigation', () => {
  it('BUG-1: home links open compose, archive and settings', async () => {
    await renderRouter({
      _layout: () => (
        <Wrapped>
          <Slot />
        </Wrapped>
      ),
      index: Home,
      compose: Compose,
      archive: Archive,
      settings: Settings,
    });
    expect(screen.getByTestId('screen-index')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('home-compose'));
    expect(screen.getByTestId('screen-compose')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('compose-close'));
    await fireEvent.press(screen.getByTestId('link-archive'));
    expect(screen.getByTestId('screen-archive')).toBeTruthy();
  });
});

