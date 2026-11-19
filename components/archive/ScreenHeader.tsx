import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { MIN_TARGET, useTheme } from '@/theme';

type Props = { title: string; subtitle?: string; testID: string; right?: ReactNode };

/** Round back button, optional trailing action, then the page title. Shared by the archive screens. */
export function ScreenHeader({ title, subtitle, testID, right }: Props) {
  const { theme } = useTheme();
  const { colors, type, space } = theme;
  const router = useRouter();
  return (
    <View style={{ gap: space.s8 }}>
      <View style={styles.top}>
        <Pressable
          testID={`${testID}-back`}
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={[styles.back, { backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle }]}
        >
          <Icon name="chevronLeft" color={colors.textPrimary} />
        </Pressable>
        {right}
      </View>
      <Text accessibilityRole="header" style={[type.titleL, { color: colors.textPrimary, marginTop: space.s8 }]}>
        {title}
      </Text>
      {subtitle ? <Text style={[type.bodyS, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: MIN_TARGET, height: MIN_TARGET, borderRadius: 24, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
