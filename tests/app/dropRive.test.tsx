// The Rive drop-in on Home (docs/decisions.md 2026-11-27): after compose leaves, the note is added,
// the scene plays over the jar, the haptic fires on touchdown, and the coordinator is released
// only when the scene ends. If the scene cannot start, the Reanimated drop plays instead.
import * as Haptics from 'expo-haptics';
import { act, render } from '@testing-library/react-native';
import { dropCoordinator } from '@/motion/dropCoordinator';
import { DropJar } from '@/components/jar/DropJar';
import { mood, ThemeProvider } from '@/theme';
import { RIVE_SETTLE_MS } from '@/components/jar/riveNoteDrop';
import { mockAdd, mockRive } from './setup';

const listeners: Record<string, (e?: unknown) => void> = {};
jest.mock('expo-router', () => {
  const actual = jest.requireActual('expo-router');
  return {
    ...actual,
    useNavigation: () => ({
      addListener: (name: string, fn: (e?: unknown) => void) => {
        listeners[name] = fn;
        return () => delete listeners[name];
      },
    }),
  };
});

const ui = (
  <ThemeProvider>
    <DropJar total={3} colours={['red', 'blue', null]} />
  </ThemeProvider>
);

async function dropIn() {
  dropCoordinator.cancel();
  dropCoordinator.request({ text: 'Sunny walk', colour: 'pink' });
  dropCoordinator.leaving();
  await act(async () => listeners.transitionEnd({ data: { closing: false } }));
  await act(async () => {
    jest.advanceTimersByTime(RIVE_SETTLE_MS); // the scene's first frame settles on screen
  });
}

describe('Rive drop-in', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockAdd.mockReset().mockResolvedValue('c1');
    mockRive.file = {};
    mockRive.values = {};
    mockRive.triggered = [];
    mockRive.emit = null;
    mockRive.viewReady = true;
    mockRive.listenThrows = false;
    dropCoordinator.landed(); // a previous test may have left a drop mid-flight
    dropCoordinator.cancel();
  });
  afterEach(() => {
    mockRive.file = undefined;
    jest.useRealTimers();
  });

  it('plays the scene with the note, the jar as it was, and the next slot', async () => {
    const r = await render(ui);
    await dropIn();
    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(r.getByTestId('rive-note-drop', { includeHiddenElements: true })).toBeTruthy();
    expect(mockRive.triggered).toEqual(['drop']);
    expect(mockRive.values.noteText).toBe('Sunny walk');
    expect(mockRive.values.noteColour).toBe(mood.pink);
    expect(mockRive.values.slipCount).toBe(3);
    expect(mockRive.values.slip01).toBe(mood.red);
    expect(mockRive.values.slip03).toBe('#e9dfcc');
    expect(mockRive.values.labelOpacity).toBe(0);
    expect(mockRive.values.faceOpacity).toBe(1); // the face reacts, and the home jar draws it too
    expect(typeof mockRive.values.landX).toBe('number');
  });

  it('fires the haptic on touchdown and releases the drop only when the scene ends', async () => {
    const r = await render(ui);
    await dropIn();
    await act(async () => mockRive.emit?.('landed'));
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    expect(dropCoordinator.phase()).toBe('landing'); // a waiting seal must not start under the scene
    await act(async () => mockRive.emit?.('finished'));
    expect(dropCoordinator.phase()).toBe('idle');
    expect(r.queryByTestId('rive-note-drop', { includeHiddenElements: true })).toBeNull();
  });

  it('finishes on its own if the scene never reports back', async () => {
    const r = await render(ui);
    await dropIn();
    await act(async () => {
      jest.advanceTimersByTime(4000);
    });
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    expect(dropCoordinator.phase()).toBe('idle');
    expect(r.queryByTestId('rive-note-drop', { includeHiddenElements: true })).toBeNull();
  });

  it('keeps playing and finishes on its timers if the runtime cannot listen (Android render error)', async () => {
    mockRive.listenThrows = true;
    const r = await render(ui);
    await dropIn();
    expect(mockRive.triggered).toEqual(['drop']);
    await act(async () => {
      jest.advanceTimersByTime(4000);
    });
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    expect(dropCoordinator.phase()).toBe('idle');
    expect(r.queryByTestId('rive-note-drop', { includeHiddenElements: true })).toBeNull();
  });

  it('keeps the home jar showing until the scene has drawn, then plays', async () => {
    const r = await render(ui);
    dropCoordinator.cancel();
    dropCoordinator.request({ text: 'Sunny walk', colour: 'pink' });
    dropCoordinator.leaving();
    await act(async () => listeners.transitionEnd({ data: { closing: false } }));
    const homeJar = () => r.getByTestId('home-jar', { includeHiddenElements: true });
    expect(mockRive.triggered).toEqual([]);
    expect(homeJar()).toHaveStyle({ opacity: 1 });
    await act(async () => {
      jest.advanceTimersByTime(RIVE_SETTLE_MS);
    });
    expect(mockRive.triggered).toEqual(['drop']);
    expect(homeJar()).toHaveStyle({ opacity: 0 });
  });

  it('falls back to the Reanimated drop when the scene cannot start', async () => {
    mockRive.viewReady = false;
    const r = await render(ui);
    await dropIn();
    expect(r.queryByTestId('rive-note-drop', { includeHiddenElements: true })).toBeNull();
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    expect(dropCoordinator.phase()).toBe('idle');
  });

  it('draws the Waiting face on the home jar, so the scene hands back to the same face', async () => {
    const r = await render(ui);
    expect(r.getByTestId('jar-face', { includeHiddenElements: true })).toBeTruthy();
  });

  it('uses the Reanimated drop when the scene file is not loaded', async () => {
    mockRive.file = undefined;
    const r = await render(ui);
    await dropIn();
    expect(r.queryByTestId('rive-note-drop', { includeHiddenElements: true })).toBeNull();
    expect(mockRive.triggered).toEqual([]);
    expect(dropCoordinator.phase()).toBe('idle');
  });
});
