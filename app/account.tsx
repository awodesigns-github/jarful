import { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { AccountScreen, Card, InfoRow, Note, PillButton, errorCopy } from '@/components/account/Parts';
import { useAccount, useAuthMethods, useHeldNotes, useSignOut } from '@/lib/data';
import { space, useTheme } from '@/theme';

export default function Account() {
  const { colors, type } = useTheme().theme;
  const router = useRouter();
  const account = useAccount();
  const methods = useAuthMethods();
  const { heldCount, adoptHeldNotes } = useHeldNotes();
  const signOut = useSignOut();
  const [confirmingOut, setConfirmingOut] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const signedIn = account?.kind === 'signedIn';
  const anyMethod = !!methods && (methods.google || methods.email);
  const go = (href: string) => router.push(href as Href);

  const adopt = async () => {
    setBusy(true);
    try {
      await adoptHeldNotes();
      setMessage('Done. Those notes will join this jar.');
    } catch (e) {
      setMessage(errorCopy(e));
    } finally {
      setBusy(false);
    }
  };

  const doSignOut = async () => {
    setBusy(true);
    try {
      await signOut();
      setConfirmingOut(false);
      setMessage('Signed out. This phone starts a new jar.');
    } catch (e) {
      setMessage(errorCopy(e));
    } finally {
      setBusy(false);
    }
  };

  const actions = signedIn ? (
    confirmingOut ? null : <PillButton testID="account-signout" label="Sign out" onPress={() => setConfirmingOut(true)} />
  ) : anyMethod ? (
    <PillButton testID="account-signin" label="Sign in to back up" onPress={() => go('/sign-in')} />
  ) : null;

  return (
    <AccountScreen testID="account-screen" title="Account" actions={actions}>
      {signedIn ? (
        <>
          <InfoRow testID="account-method" label="Signed in with" value={account?.method === 'google' ? 'Google' : 'Email'} />
          {(account?.email || account?.name) && <InfoRow testID="account-identity" label={account?.name ? 'Name' : 'Email'} value={account?.name ?? account?.email ?? ''} />}
          <InfoRow testID="account-privacy" label="Privacy" value="Only you can see your notes" />
        </>
      ) : (
        <>
          <Card testID="account-anonymous">
            <Text style={[type.titleS, { color: colors.textPrimary }]}>Your notes are on this phone</Text>
            <Text style={[type.bodyM, { color: colors.textSecondary }]}>
              Your notes are saved on this phone. Sign in to back them up. Only you can see them, and Jarful works either way.
            </Text>
          </Card>
          <InfoRow testID="account-privacy" label="Privacy" value="Only you can see your notes" />
          {methods && !anyMethod && (
            <Card testID="account-signin-soon">
              <Text style={[type.titleS, { color: colors.textPrimary }]}>Sign-in is coming soon</Text>
              <Text style={[type.bodyM, { color: colors.textSecondary }]}>Backing up will arrive in a later update. Your notes are safe on this phone meanwhile.</Text>
            </Card>
          )}
        </>
      )}

      {heldCount > 0 && (
        <Card testID="account-held-notes">
          <Text style={[type.bodyL, { color: colors.textPrimary }]}>
            {heldCount === 1 ? '1 note from an earlier session is waiting on this phone' : `${heldCount} notes from an earlier session are waiting on this phone`}
          </Text>
          <Text style={[type.bodyS, { color: colors.textSecondary }]}>They are safe. They will send if that account signs back in, or you can add them here.</Text>
          <PillButton testID="account-held-adopt" label="Add them to this account" onPress={adopt} disabled={busy} />
        </Card>
      )}

      {confirmingOut && (
        <Card testID="signout-confirm-card">
          <Text accessibilityRole="header" style={[type.titleS, { color: colors.textPrimary }]}>Sign out?</Text>
          <Text style={[type.bodyM, { color: colors.textSecondary }]}>
            Your notes stay safe in your account. This phone will start a new, empty jar until you sign in again.
          </Text>
          <View style={{ gap: space.s12, marginTop: space.s8 }}>
            <PillButton testID="signout-cancel" kind="primary" label="Stay signed in" onPress={() => setConfirmingOut(false)} />
            <PillButton testID="signout-confirm" label="Sign out" onPress={doSignOut} disabled={busy} />
          </View>
        </Card>
      )}

      {message && <Note testID="account-message">{message}</Note>}

      <View style={{ flex: 1 }} />
      <InfoRow testID="account-delete" label="Delete account and notes" onPress={() => go('/delete-account')} />
    </AccountScreen>
  );
}
