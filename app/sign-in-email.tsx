import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { AccountScreen, Body, Note, PillButton, errorCopy } from '@/components/account/Parts';
import { useEmailSignIn } from '@/lib/data';
import { MIN_TARGET, radius, space, useTheme } from '@/theme';

export default function SignInEmail() {
  const { colors, type } = useTheme().theme;
  const router = useRouter();
  const { sendCode } = useEmailSignIn();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await sendCode(email);
      router.push({ pathname: '/sign-in-code', params: { email: email.trim().toLowerCase() } } as unknown as Href);
    } catch (e) {
      setMessage(errorCopy(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccountScreen
      testID="signin-email-screen"
      title="Your email"
      actions={<PillButton testID="email-continue" kind="primary" label="Send code" onPress={submit} disabled={busy || email.trim().length === 0} />}
    >
      <Body>We will email you a 6-digit code. No password needed.</Body>
      <TextInput
        testID="email-input"
        accessibilityLabel="Email address"
        value={email}
        onChangeText={(t) => {
          setEmail(t);
          if (message) setMessage(null);
        }}
        onSubmitEditing={submit}
        placeholder="maya@example.com"
        placeholderTextColor={colors.textSecondary}
        keyboardType="email-address"
        inputMode="email"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="send"
        style={[styles.input, type.bodyL, { color: colors.textPrimary, backgroundColor: colors.bgSurface, borderColor: colors.borderStrong }]}
      />
      {message && <Note testID="email-message">{message}</Note>}
    </AccountScreen>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 56, minWidth: MIN_TARGET, borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: space.s16 },
});
