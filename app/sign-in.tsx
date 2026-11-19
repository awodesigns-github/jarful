import { useState } from 'react';
import { View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { AccountScreen, Body, Card, Note, PillButton, errorCopy } from '@/components/account/Parts';
import { useAuthMethods, useSignInWithGoogle } from '@/lib/data';
import { space } from '@/theme';

export default function SignIn() {
  const router = useRouter();
  const methods = useAuthMethods();
  const signInWithGoogle = useSignInWithGoogle();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const google = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await signInWithGoogle();
      if (r === 'signedIn') router.replace('/sign-in-progress' as Href);
    } catch (e) {
      setMessage(errorCopy(e));
    } finally {
      setBusy(false);
    }
  };

  const none = !!methods && !methods.google && !methods.email;
  return (
    <AccountScreen
      testID="signin-screen"
      title="Back up your notes"
      actions={
        <>
          {methods?.google && <PillButton testID="account-signin-google" kind="primary" label="Continue with Google" onPress={google} disabled={busy} />}
          {methods?.email && <PillButton testID="account-signin-email" label="Continue with email" onPress={() => router.push('/sign-in-email' as Href)} disabled={busy} />}
          <PillButton testID="signin-not-now" label="Not now" onPress={() => (router.canGoBack() ? router.back() : router.replace('/account' as Href))} />
        </>
      }
    >
      <Body>Signing in is optional. It keeps your notes safe if you change phones. Jarful works the same without it.</Body>
      {none && (
        <Card testID="signin-soon">
          <Body>Sign-in is coming soon.</Body>
        </Card>
      )}
      <View style={{ height: space.s4 }} />
      {message && <Note testID="signin-message">{message}</Note>}
    </AccountScreen>
  );
}
