import { Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { AccountScreen, Body, PillButton } from '@/components/account/Parts';
import { useMergeStatus } from '@/lib/data';
import { radius, space, useTheme } from '@/theme';

/** Shows the merge or restore that runs by itself after sign-in. Plain stack screen (BUG-3). */
export default function SignInProgress() {
  const { colors, type } = useTheme().theme;
  const router = useRouter();
  const status = useMergeStatus();
  const done = status.state === 'merged';
  const failed = status.state === 'failed';
  const working = !done && !failed;

  const toJar = () => router.dismissTo('/' as Href);
  const toAccount = () => router.replace('/account' as Href);

  return (
    <AccountScreen
      testID="signin-progress-screen"
      back={false}
      actions={
        done ? (
          <PillButton testID="merge-done" kind="primary" label="Go to my jar" onPress={toJar} />
        ) : failed ? (
          <PillButton testID="merge-not-now" label="Not now" onPress={toAccount} />
        ) : (
          <PillButton testID="merge-account" label="Go to account" onPress={toAccount} />
        )
      }
    >
      <View style={{ flex: 1, justifyContent: 'center', gap: space.s16 }} testID="merge-progress" accessibilityLiveRegion="polite">
        <Text accessibilityRole="header" style={[type.titleL, { color: colors.textPrimary }]}>
          {done ? 'All your notes are here.' : failed ? 'Your notes are safe' : 'Bringing your notes together…'}
        </Text>
        <Body testID="merge-detail">
          {done
            ? status.state === 'merged' && status.notes > 0
              ? `${status.notes} ${status.notes === 1 ? 'note' : 'notes'} from this phone joined your account.`
              : 'You are signed in and backed up.'
            : failed
              ? 'They are still on this phone. We could not bring them together just now, and you can try again later.'
              : 'This only takes a moment. You can keep using Jarful.'}
        </Body>
        {working && (
          <View accessibilityRole="progressbar" accessibilityLabel="Bringing your notes together" style={{ height: 8, borderRadius: radius.pill, backgroundColor: colors.bgSunken, overflow: 'hidden' }}>
            <View style={{ width: '45%', height: 8, backgroundColor: colors.actionPrimary }} />
          </View>
        )}
      </View>
    </AccountScreen>
  );
}
