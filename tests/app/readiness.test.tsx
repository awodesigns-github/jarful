/// <reference types="jest" />
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
jest.mock('@convex-dev/auth/react', () => ({ useAuthActions: () => ({ signIn: jest.fn() }) }));
jest.mock('convex/react', () => ({ useConvexAuth: () => ({ isLoading: false, isAuthenticated: false }) }));
jest.mock('@/lib/data/client', () => ({ secureStorage: { getItem: async () => null } }));
import { computeReadiness } from '@/lib/data/useEnsureAnonymousSignIn';
import { ThemeProvider } from '@/theme';
import Home from '@/app/index';
import { mockJar, mockPending } from './setup';

const base = { hasStoredSession: false, isAuthenticated: false, error: null, timedOut: false };

describe('computeReadiness (BUG-8: local-first, never blocks Home)', () => {
  it('no session: background sign-in, not blocked, even while the keystore is read', () => {
    expect(computeReadiness(base)).toBe('background');
    expect(computeReadiness({ ...base, hasStoredSession: null })).toBe('background');
    expect(computeReadiness({ ...base, timedOut: true })).toBe('background');
  });
  it('a stored session is ready without waiting for auth', () => {
    expect(computeReadiness({ ...base, hasStoredSession: true })).toBe('ready');
    expect(computeReadiness({ ...base, hasStoredSession: null, isAuthenticated: true })).toBe('ready');
  });
  it('only an exhausted retry with no session is unrecoverable (a quiet hint)', () => {
    expect(computeReadiness({ ...base, error: new Error('x') })).toBe('unrecoverable');
  });
});

describe('Home copy (BUG-5)', () => {
  const wrap = ({ children }: { children: React.ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
  );
  afterEach(() => {
    mockJar.current = null;
    mockPending.current = 0;
  });
  it('pending notes only (jar unknown) is not the empty state', async () => {
    mockJar.current = undefined;
    mockPending.current = 2;
    const { queryByText } = await render(<Home />, { wrapper: wrap });
    expect(queryByText('Your jar is ready for its first good thing')).toBeNull();
  });
  it('unknown jar with nothing pending is not treated as empty', async () => {
    mockJar.current = undefined;
    mockPending.current = 0;
    const { queryByText } = await render(<Home />, { wrapper: wrap });
    expect(queryByText('Your jar is ready for its first good thing')).toBeNull();
  });
  it('a known empty jar still shows the welcome copy', async () => {
    mockJar.current = null;
    const { getByText } = await render(<Home />, { wrapper: wrap });
    getByText('Your jar is ready for its first good thing');
  });
});
