/// <reference types="jest" />
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
jest.mock('@convex-dev/auth/react', () => ({ useAuthActions: () => ({ signIn: jest.fn() }) }));
jest.mock('convex/react', () => ({ useConvexAuth: () => ({ isLoading: true, isAuthenticated: false }) }));
jest.mock('@/lib/data/client', () => ({ secureStorage: { getItem: async () => null } }));
import { computeReadiness } from '@/lib/data/useEnsureAnonymousSignIn';
import { ThemeProvider } from '@/theme';
import Home from '@/app/index';
import { mockJar, mockPending } from './setup';

const base = { hasStoredSession: false, isAuthenticated: false, error: null, timedOut: false };

describe('computeReadiness (BUG-4)', () => {
  it('stored session + offline (not authenticated) is ready', () => {
    expect(computeReadiness({ ...base, hasStoredSession: true })).toBe('ready');
  });
  it('no session + offline: checking, then the gate with retry after the timeout', () => {
    expect(computeReadiness(base)).toBe('checking');
    expect(computeReadiness({ ...base, timedOut: true })).toBe('blocked');
    expect(computeReadiness({ ...base, error: new Error('x') })).toBe('blocked');
  });
  it('waits while the keystore is read, and is ready once authenticated', () => {
    expect(computeReadiness({ ...base, hasStoredSession: null })).toBe('checking');
    expect(computeReadiness({ ...base, isAuthenticated: true })).toBe('ready');
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
