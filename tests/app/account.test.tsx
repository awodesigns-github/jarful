/// <reference types="jest" />
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme';
import Account from '@/app/account';
import SignIn from '@/app/sign-in';
import SignInEmail from '@/app/sign-in-email';
import SignInCode from '@/app/sign-in-code';
import SignInProgress from '@/app/sign-in-progress';
import DeleteConfirm from '@/app/delete-confirm';
import DeleteDone from '@/app/delete-done';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockDismissTo = jest.fn();
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true, replace: mockReplace, push: mockPush, dismissTo: mockDismissTo }),
  useLocalSearchParams: () => ({ email: 'maya@example.com' }),
}));

const mockState: any = {
  account: { userId: 'u1', kind: 'anonymous', method: null, email: null, name: null },
  methods: { google: false, email: false } as { google: boolean; email: boolean } | undefined,
  held: 0,
  merge: { state: 'idle' },
};
const mockGoogle = jest.fn();
const mockSend = jest.fn();
const mockVerify = jest.fn();
const mockSignOut = jest.fn();
const mockDelete = jest.fn();
const mockAdopt = jest.fn();
jest.mock('@/lib/data', () => ({
  useSettings: () => ({ reminderTime: null, theme: 'light', reducedMotion: 'system', haptics: true }),
  useUpdateSettings: () => jest.fn(),
  AuthFlowError: class extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
  useAccount: () => mockState.account,
  useAuthMethods: () => mockState.methods,
  useSignInWithGoogle: () => mockGoogle,
  useEmailSignIn: () => ({ sendCode: mockSend, verifyCode: mockVerify }),
  useSignOut: () => mockSignOut,
  useDeleteAccount: () => mockDelete,
  useMergeStatus: () => mockState.merge,
  useHeldNotes: () => ({ heldCount: mockState.held, adoptHeldNotes: mockAdopt }),
}));

const metrics = { frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SafeAreaProvider initialMetrics={metrics}>
    <ThemeProvider>{children}</ThemeProvider>
  </SafeAreaProvider>
);
const err = (code: string) => new (jest.requireMock('@/lib/data').AuthFlowError)(code);

beforeEach(() => {
  jest.clearAllMocks();
  mockState.account = { userId: 'u1', kind: 'anonymous', method: null, email: null, name: null };
  mockState.methods = { google: false, email: false };
  mockState.held = 0;
  mockState.merge = { state: 'idle' };
});

describe('Account (US-10, US-11, US-18)', () => {
  it('shows "coming soon" and no sign-in buttons when no method is configured', async () => {
    const { getByTestId, queryByTestId, getByText } = await render(<Account />, { wrapper });
    expect(getByTestId('account-screen')).toBeTruthy();
    expect(getByTestId('account-signin-soon')).toBeTruthy();
    expect(getByText('Sign-in is coming soon')).toBeTruthy();
    expect(queryByTestId('account-signin')).toBeNull();
  });

  it('sign-in choose shows only the configured methods', async () => {
    mockState.methods = { google: false, email: true };
    const a = await render(<SignIn />, { wrapper });
    expect(a.queryByTestId('account-signin-google')).toBeNull();
    expect(a.getByTestId('account-signin-email')).toBeTruthy();
    await a.unmount();
    mockState.methods = { google: true, email: false };
    const b = await render(<SignIn />, { wrapper });
    expect(b.getByTestId('account-signin-google')).toBeTruthy();
    expect(b.queryByTestId('account-signin-email')).toBeNull();
  });

  it('Google: cancelled stays quiet, success goes to progress', async () => {
    mockState.methods = { google: true, email: false };
    mockState.methods = { google: true, email: false };
    mockGoogle.mockResolvedValueOnce('cancelled');
    const { getByTestId, queryByTestId } = await render(<SignIn />, { wrapper });
    await fireEvent.press(getByTestId('account-signin-google'));
    await waitFor(() => expect(mockGoogle).toHaveBeenCalled());
    expect(queryByTestId('signin-message')).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
    mockGoogle.mockResolvedValueOnce('signedIn');
    await fireEvent.press(getByTestId('account-signin-google'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/sign-in-progress'));
  });

  it('email: gentle message for a bad address, then sends the code and moves on', async () => {
    const { getByTestId, findByTestId } = await render(<SignInEmail />, { wrapper });
    expect(getByTestId('email-input').props.keyboardType).toBe('email-address');
    await fireEvent.changeText(getByTestId('email-input'), 'maya@example');
    mockSend.mockRejectedValueOnce(err('invalid-email'));
    await fireEvent.press(getByTestId('email-continue'));
    expect((await findByTestId('email-message')).props.children).toMatch(/does not look quite right/);
    await fireEvent.changeText(getByTestId('email-input'), 'Maya@Example.com');
    mockSend.mockResolvedValueOnce(undefined);
    await fireEvent.press(getByTestId('email-continue'));
    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(mockSend).toHaveBeenLastCalledWith('Maya@Example.com');
    expect(mockPush.mock.calls[0][0].params.email).toBe('maya@example.com');
  });

  it('code: one-time-code field, wrong code error, resend, then success', async () => {
    const { getByTestId, findByTestId, queryByTestId } = await render(<SignInCode />, { wrapper });
    const input = getByTestId('code-input');
    expect(input.props.textContentType).toBe('oneTimeCode');
    expect(input.props.autoComplete).toBe('sms-otp');
    expect(input.props.keyboardType).toBe('number-pad');
    expect(getByTestId('code-verify').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(input, '48a2916');
    mockVerify.mockRejectedValueOnce(err('invalid-code'));
    await fireEvent.press(getByTestId('code-verify'));
    expect((await findByTestId('code-message')).props.children).toMatch(/did not work/);
    expect(mockVerify).toHaveBeenCalledWith('maya@example.com', '482916');
    mockSend.mockResolvedValueOnce(undefined);
    await fireEvent.press(getByTestId('code-resend'));
    await waitFor(() => expect(mockSend).toHaveBeenCalledWith('maya@example.com'));
    await fireEvent.changeText(getByTestId('code-input'), '123456');
    mockVerify.mockResolvedValueOnce('signedIn');
    await fireEvent.press(getByTestId('code-verify'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/sign-in-progress'));
    expect(queryByTestId('code-message')).toBeNull();
  });

  it('code: an offline error asks to connect first', async () => {
    const { getByTestId, findByTestId } = await render(<SignInCode />, { wrapper });
    await fireEvent.changeText(getByTestId('code-input'), '123456');
    mockVerify.mockRejectedValueOnce(err('offline'));
    await fireEvent.press(getByTestId('code-verify'));
    expect((await findByTestId('code-message')).props.children).toMatch(/Connect to the internet/);
  });

  it('merge progress moves from working to done and to a calm failure', async () => {
    mockState.merge = { state: 'merging' };
    const a = await render(<SignInProgress />, { wrapper });
    expect(a.getByText('Bringing your notes together…')).toBeTruthy();
    await a.unmount();
    mockState.merge = { state: 'merged', notes: 12 };
    const b = await render(<SignInProgress />, { wrapper });
    expect(b.getByText('All your notes are here.')).toBeTruthy();
    expect(b.getByText('12 notes from this phone joined your account.')).toBeTruthy();
    await fireEvent.press(b.getByTestId('merge-done'));
    expect(mockDismissTo).toHaveBeenCalledWith('/');
    await b.unmount();
    mockState.merge = { state: 'failed', reason: 'expired' };
    const c = await render(<SignInProgress />, { wrapper });
    expect(c.getByText('Your notes are safe')).toBeTruthy();
    expect(c.getByTestId('merge-progress')).toBeTruthy();
  });

  it('held notes row appears only when there are held notes and adopts them', async () => {
    const a = await render(<Account />, { wrapper });
    expect(a.queryByTestId('account-held-notes')).toBeNull();
    await a.unmount();
    mockState.held = 3;
    mockAdopt.mockResolvedValueOnce(undefined);
    const b = await render(<Account />, { wrapper });
    expect(b.getByText('3 notes from an earlier session are waiting on this phone')).toBeTruthy();
    await fireEvent.press(b.getByTestId('account-held-adopt'));
    await waitFor(() => expect(mockAdopt).toHaveBeenCalled());
  });

  it('signed in: shows the email and signs out only after a confirm', async () => {
    mockState.methods = { google: true, email: true };
    mockState.account = { userId: 'u2', kind: 'signedIn', method: 'email', email: 'maya@example.com', name: null };
    mockSignOut.mockResolvedValueOnce(undefined);
    const { getByTestId, getByText, queryByTestId } = await render(<Account />, { wrapper });
    expect(getByText('maya@example.com')).toBeTruthy();
    expect(queryByTestId('account-signin')).toBeNull();
    await fireEvent.press(getByTestId('account-signout'));
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(getByText(/new, empty jar/)).toBeTruthy();
    await fireEvent.press(getByTestId('signout-confirm'));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
  });

  it('delete: confirm calls deleteAccount, then the done screen; offline deletes nothing', async () => {
    const { getByTestId, findByTestId } = await render(<DeleteConfirm />, { wrapper });
    mockDelete.mockRejectedValueOnce(err('offline'));
    await fireEvent.press(getByTestId('delete-confirm'));
    expect((await findByTestId('delete-message')).props.children).toMatch(/Nothing was deleted/);
    expect(mockReplace).not.toHaveBeenCalled();
    mockDelete.mockResolvedValueOnce(undefined);
    await fireEvent.press(getByTestId('delete-confirm'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/delete-done'));
    expect(mockDelete).toHaveBeenCalledTimes(2);
    const done = await render(<DeleteDone />, { wrapper });
    expect(done.getByTestId('delete-done')).toBeTruthy();
    expect(done.getByText('Your account and notes are gone.')).toBeTruthy();
    expect(done.getByText("You're starting fresh.")).toBeTruthy();
  });
});
