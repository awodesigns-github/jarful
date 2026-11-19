import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { AuthFlowError } from '@/lib/data';
import { MIN_TARGET, radius, space, useTheme } from '@/theme';

/** Calm, plain wording for every auth error. Nothing is lost in any of them. */
export function errorCopy(e: unknown): string {
  const code = e instanceof AuthFlowError ? e.code : 'failed';
  switch (code) {
    case 'offline':
      return 'Connect to the internet first. Nothing has changed.';
    case 'unavailable':
      return 'That way of signing in is not ready yet. Nothing has changed.';
    case 'invalid-email':
      return 'That email does not look quite right. Check it and try again.';
    case 'invalid-code':
      return 'That code did not work. It may have expired, so you can ask for a new one.';
    default:
      return 'Something went wrong on our side. Nothing has changed, so try again in a moment.';
  }
}

/** Shared frame: back button, title, body that scrolls, actions pinned at the foot. */
export function AccountScreen({
  testID,
  title,
  back = true,
  children,
  actions,
}: {
  testID: string;
  title?: string;
  back?: boolean;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const { theme } = useTheme();
  const { colors, type } = theme;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <KeyboardAvoidingView
      testID={testID}
      style={{ flex: 1, backgroundColor: colors.bgBase, paddingTop: insets.top + space.s4 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.flex}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: space.s24, gap: space.s16, flexGrow: 1, paddingBottom: space.s16 }}
      >
        {back && (
          <Pressable
            testID={`${testID}-back`}
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
            style={styles.back}
          >
            <Icon name="chevronLeft" size={24} color={colors.textPrimary} />
          </Pressable>
        )}
        {title ? (
          <Text accessibilityRole="header" style={[type.titleL, { color: colors.textPrimary }]}>
            {title}
          </Text>
        ) : null}
        {children}
      </ScrollView>
      {actions ? <View style={{ paddingHorizontal: space.s24, paddingBottom: insets.bottom + space.s16, gap: space.s12 }}>{actions}</View> : null}
    </KeyboardAvoidingView>
  );
}

export function Body({ children, testID }: { children: ReactNode; testID?: string }) {
  const { theme } = useTheme();
  return (
    <Text testID={testID} style={[theme.type.bodyL, { color: theme.colors.textSecondary }]}>
      {children}
    </Text>
  );
}

export function Card({ children, testID }: { children: ReactNode; testID?: string }) {
  const { theme } = useTheme();
  return (
    <View
      testID={testID}
      style={{
        backgroundColor: theme.colors.bgSurface,
        borderColor: theme.colors.borderSubtle,
        borderWidth: 1,
        borderRadius: radius.lg,
        padding: space.s20,
        gap: space.s8,
      }}
    >
      {children}
    </View>
  );
}

/** Pill button with the offset shadow from the design. Primary is filled, secondary is outlined. */
export function PillButton({
  testID,
  label,
  onPress,
  kind = 'secondary',
  disabled,
  hint,
}: {
  testID: string;
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary';
  disabled?: boolean;
  hint?: string;
}) {
  const { colors, type } = useTheme().theme;
  const primary = kind === 'primary';
  return (
    <View style={[styles.shadow, { backgroundColor: primary ? colors.accentMuted : colors.borderStrong, opacity: disabled ? 0.5 : 1 }]}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={hint}
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.pill,
          {
            backgroundColor: primary ? colors.actionPrimary : colors.bgSurface,
            borderColor: colors.borderStrong,
            transform: [{ scale: pressed ? 0.97 : 1 }],
          },
        ]}
      >
        <Text style={[type.labelL, { color: primary ? colors.actionOnPrimary : colors.textPrimary }]}>{label}</Text>
      </Pressable>
    </View>
  );
}

/** A quiet list row. With onPress it is a button with a chevron; without, it is plain information. */
export function InfoRow({
  testID,
  label,
  value,
  onPress,
}: {
  testID: string;
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  const { colors, type } = useTheme().theme;
  const content = (
    <>
      <Text style={[type.bodyL, styles.flex, { color: colors.textPrimary }]}>{label}</Text>
      {value ? <Text style={[type.bodyM, styles.valueText, { color: colors.textSecondary }]}>{value}</Text> : null}
      {onPress ? <Icon name="chevronRight" size={20} color={colors.textSecondary} /> : null}
    </>
  );
  const rowStyle = [styles.row, { borderColor: colors.borderSubtle }];
  if (!onPress)
    return (
      <View testID={testID} accessible accessibilityLabel={value ? `${label}, ${value}` : label} style={rowStyle}>
        {content}
      </View>
    );
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      onPress={onPress}
      style={rowStyle}
    >
      {content}
    </Pressable>
  );
}

/** Quiet inline message. Never red. */
export function Note({ testID, children }: { testID?: string; children: ReactNode }) {
  const { colors, type } = useTheme().theme;
  return (
    <Text testID={testID} accessibilityLiveRegion="polite" style={[type.bodyM, { color: colors.textSecondary }]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  back: { width: MIN_TARGET, height: MIN_TARGET, alignItems: 'center', justifyContent: 'center', marginLeft: -space.s12 },
  shadow: { borderRadius: radius.pill, paddingBottom: 4 },
  pill: { minHeight: 56, borderRadius: radius.pill, borderWidth: 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.s24 },
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: space.s8, borderBottomWidth: 1 },
  valueText: { flexShrink: 1, textAlign: 'right' },
});
