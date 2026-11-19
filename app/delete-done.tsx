import { Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { AccountScreen, Body, PillButton } from '@/components/account/Parts';
import { space, useTheme } from '@/theme';

export default function DeleteDone() {
  const { colors, type } = useTheme().theme;
  const router = useRouter();
  return (
    <AccountScreen
      testID="delete-done"
      back={false}
      actions={<PillButton testID="delete-done-continue" kind="primary" label="Start fresh" onPress={() => router.dismissTo('/' as Href)} />}
    >
      <View style={{ flex: 1, justifyContent: 'center', gap: space.s16 }} accessibilityLiveRegion="polite">
        <Text accessibilityRole="header" style={[type.titleL, { color: colors.textPrimary }]}>
          Your account and notes are gone.
        </Text>
        <Body>You&apos;re starting fresh.</Body>
      </View>
    </AccountScreen>
  );
}
