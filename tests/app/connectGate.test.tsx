/// <reference types="jest" />
import { render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

const mockSignIn = jest.fn(() => new Promise(() => {}));
jest.mock('@convex-dev/auth/react', () => ({ useAuthActions: () => ({ signIn: (...a: unknown[]) => (mockSignIn as any)(...a) }) }));
jest.mock('convex/react', () => ({ useConvexAuth: () => ({ isLoading: false, isAuthenticated: false }) }));
jest.mock('@/lib/data/client', () => ({ secureStorage: { getItem: async () => null } }));
jest.mock('@/lib/data', () => jest.requireActual('@/lib/data/useEnsureAnonymousSignIn'));
import { ConnectGate } from '@/components/ConnectGate';
import { ThemeProvider } from '@/theme';

const wrap = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;

describe('ConnectGate (BUG-8)', () => {
  it('renders Home with no session while anonymous sign-in runs in the background', async () => {
    const { getByTestId, queryByTestId } = await render(
      <ConnectGate>
        <Text testID="home">Home</Text>
      </ConnectGate>,
      { wrapper: wrap },
    );
    getByTestId('home');
    expect(queryByTestId('connect-loading')).toBeNull();
    expect(queryByTestId('connect-hint')).toBeNull();
    await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith('anonymous'));
  });
});
