import { act, render } from '@testing-library/react-native';
import { createDropCoordinator } from '@/motion/dropCoordinator';
import { loadPlayedSeals, markSealPlayed, shouldPlaySeal, SEAL_KEY, type SealGate, type SealStore } from '@/motion/sealPlayed';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Home from '@/app/index';
import { ThemeProvider } from '@/theme';
import { mockSeal, mockJar } from './setup';

const mem = (init: Record<string, string> = {}): SealStore & { data: Record<string, string> } => {
  const data = { ...init };
  return { data, get: async (k) => data[k] ?? null, set: async (k, v) => void (data[k] = v) };
};
const gate = (o: Partial<SealGate> = {}): SealGate => ({
  sealJarId: 'jar1',
  played: new Set(),
  dropBusy: false,
  focused: true,
  sealing: false,
  revealOpen: false,
  ...o,
});

describe('seal gate', () => {
  it('plays a new seal once per jarId', async () => {
    const store = mem();
    expect(shouldPlaySeal(gate())).toBe('jar1');
    const played = await markSealPlayed(new Set(), 'jar1', store);
    expect(shouldPlaySeal(gate({ played }))).toBeNull();
    expect(shouldPlaySeal(gate({ played, sealJarId: 'jar2' }))).toBe('jar2');
  });

  it('does not replay after a restart (reloaded from the store)', async () => {
    const store = mem();
    await markSealPlayed(new Set(), 'jar1', store);
    expect(store.data[SEAL_KEY]).toBe('["jar1"]');
    const reloaded = await loadPlayedSeals(store);
    expect(shouldPlaySeal(gate({ played: reloaded }))).toBeNull();
  });

  it('survives a corrupt or failing store', async () => {
    expect((await loadPlayedSeals(mem({ [SEAL_KEY]: '{oops' }))).size).toBe(0);
    const failing: SealStore = { get: async () => { throw new Error('x'); }, set: async () => { throw new Error('x'); } };
    expect((await loadPlayedSeals(failing)).size).toBe(0);
    expect((await markSealPlayed(new Set(), 'a', failing)).has('a')).toBe(true);
  });

  it('waits for the list to load, focus, idle, and no reveal', () => {
    expect(shouldPlaySeal(gate({ played: null }))).toBeNull();
    expect(shouldPlaySeal(gate({ focused: false }))).toBeNull();
    expect(shouldPlaySeal(gate({ sealing: true }))).toBeNull();
    expect(shouldPlaySeal(gate({ revealOpen: true }))).toBeNull();
    expect(shouldPlaySeal(gate({ sealJarId: null }))).toBeNull();
  });

  it('never starts while a drop is mid-flight, and is released when it lands or goes stale', () => {
    let t = 0;
    const c = createDropCoordinator(() => t);
    const seen: boolean[] = [];
    c.subscribe(() => seen.push(c.isBusy()));
    c.request({ text: 'x' });
    expect(shouldPlaySeal(gate({ dropBusy: c.isBusy() }))).toBeNull();
    c.leaving();
    expect(c.isBusy()).toBe(true);
    c.dismissed({ addNote: async () => undefined, clear: () => {} });
    return Promise.resolve().then(() => {
      expect(c.phase()).toBe('landing');
      expect(c.isBusy()).toBe(true);
      c.landed();
      expect(seen).toEqual([false]);
      expect(shouldPlaySeal(gate({ dropBusy: c.isBusy() }))).toBe('jar1');
      c.request({ text: 'y' });
      t += 6000; // stuck
      expect(c.isBusy()).toBe(false);
    });
  });
});

describe('Home seal', () => {
  it('plays the seal once, then shows the fresh jar and the calm line', async () => {
    mockJar.current = null;
    mockSeal.current = { jarId: 'jarX', sealedAt: 1 };
    const ui = (
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <Home />
        </ThemeProvider>
      </SafeAreaProvider>
    );
    const r = await render(ui);
    await act(async () => {});
    // Stubbed motion completes at once: the stage ran and handed back to the jar.
    expect(r.queryByTestId('seal-stage')).toBeNull();
    expect(r.getByTestId('seal-line')).toBeTruthy();
    await r.unmount();
    mockSeal.current = null;
  });
});
