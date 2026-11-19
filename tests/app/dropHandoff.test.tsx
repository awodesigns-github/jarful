import { act, render } from '@testing-library/react-native';
import { dropCoordinator } from '@/motion/dropCoordinator';
import { DropJar } from '@/components/jar/DropJar';
import { ThemeProvider } from '@/theme';
import { mockAdd } from './setup';

const ui = (
  <ThemeProvider>
    <DropJar total={1} />
  </ThemeProvider>
);

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

function leaveCompose() {
  dropCoordinator.cancel();
  dropCoordinator.request({ text: 'Sunny walk' });
  dropCoordinator.leaving();
}

describe('drop hand-off (BUG-6)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockAdd.mockReset().mockResolvedValue('c1');
  });
  afterEach(() => jest.useRealTimers());

  it('focus without transitionEnd still adds once, after a short fallback', async () => {
    await render(ui);
    leaveCompose();
    await act(async () => listeners.focus());
    expect(mockAdd).not.toHaveBeenCalled(); // not while the modal may still be dismissing
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(mockAdd).toHaveBeenCalledTimes(1);
  });

  it('transitionEnd after focus adds once, not twice', async () => {
    await render(ui);
    leaveCompose();
    await act(async () => listeners.focus());
    await act(async () => listeners.transitionEnd({ data: { closing: false } }));
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(mockAdd).toHaveBeenCalledTimes(1);
  });
});
