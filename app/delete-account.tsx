import { Text } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { AccountScreen, Body, Card, PillButton } from '@/components/account/Parts';
import { useTheme } from '@/theme';

const ITEMS = ['Every note and favourite', 'Every jar on your shelf', 'Your settings, backup and sign-in'];

export default function DeleteAccount() {
  const { colors, type } = useTheme().theme;
  const router = useRouter();
  return (
    <AccountScreen
      testID="delete-explainer-screen"
      title="Delete your account"
      actions={
        <>
          <PillButton testID="delete-keep" kind="primary" label="Keep my notes" onPress={() => router.back()} />
          <PillButton testID="delete-continue" label="Continue to delete" onPress={() => router.push('/delete-confirm' as Href)} />
        </>
      }
    >
      <Body>This removes your account, your notes, your jars and your settings for good, here and in your backup. It cannot be undone.</Body>
      <Card testID="delete-list">
        {ITEMS.map((i) => (
          <Text key={i} style={[type.bodyL, { color: colors.textPrimary }]}>
            {i}
          </Text>
        ))}
      </Card>
    </AccountScreen>
  );
}
