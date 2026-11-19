import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { AccountScreen, Body, Note, PillButton, errorCopy } from '@/components/account/Parts';
import { useEmailSignIn } from '@/lib/data';
import { radius, space, useTheme } from '@/theme';

const LENGTH = 6;

export default function SignInCode() {
  const { colors, type } = useTheme().theme;
  const router = useRouter();
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();
  const email = String(emailParam ?? '');
  const { verifyCode, sendCode } = useEmailSignIn();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const verify = async () => {
    if (busy || code.length < LENGTH) return;
    setBusy(true);
    setMessage(null);
    try {
      await verifyCode(email, code);
      router.replace('/sign-in-progress' as Href);
    } catch (e) {
      setMessage(errorCopy(e));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setMessage(null);
    try {
      await sendCode(email);
      setCode('');
      setMessage('A new code is on its way. Use the latest one.');
    } catch (e) {
      setMessage(errorCopy(e));
    }
  };

  const digits = Array.from({ length: LENGTH }, (_, i) => code[i] ?? '');
  return (
    <AccountScreen
      testID="signin-code-screen"
      title="Enter your code"
      actions={
        <>
          <PillButton testID="code-verify" kind="primary" label="Confirm" onPress={verify} disabled={busy || code.length < LENGTH} />
          <PillButton testID="code-resend" label="Send a new code" onPress={resend} disabled={busy} />
        </>
      }
    >
      <Body>{email ? `Sent to ${email}` : 'Check your email for the code.'}</Body>
      <View style={styles.boxes}>
        {digits.map((d, i) => {
          const filled = d !== '';
          return (
            <View
              key={i}
              style={[
                styles.box,
                { backgroundColor: colors.bgSurface, borderColor: filled ? colors.borderStrong : colors.borderSubtle, borderWidth: filled ? 1.5 : 1 },
              ]}
            >
              <Text style={[type.titleM, { color: colors.textPrimary }]}>{d}</Text>
            </View>
          );
        })}
        {/* One real field sits over the boxes, so pasting, autofill and the keyboard all work. */}
        <TextInput
          testID="code-input"
          accessibilityLabel="6-digit code"
          accessibilityHint="Type or paste the code from your email"
          value={code}
          onChangeText={(t) => {
            setCode(t.replace(/\D/g, '').slice(0, LENGTH));
            if (message) setMessage(null);
          }}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={LENGTH}
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          autoFocus
          caretHidden
          selectionColor="transparent"
          style={styles.overlay}
        />
      </View>
      {message && <Note testID="code-message">{message}</Note>}
    </AccountScreen>
  );
}

const styles = StyleSheet.create({
  boxes: { flexDirection: 'row', gap: space.s8, height: 56 },
  box: { flex: 1, height: 56, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  overlay: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, color: 'transparent', backgroundColor: 'transparent', fontSize: 1 },
});
