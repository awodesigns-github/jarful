import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useEnsureAnonymousSignIn } from '@/lib/data';
import { MIN_TARGET, useTheme } from '@/theme';

/**
 * Never blocks Home. Anonymous sign-in runs in the background (with its retry and
 * backoff); notes queue on the device meanwhile. Only if every retry fails does a
 * quiet hint appear, with a gentle retry. No red, no alarms.
 */
export function ConnectGate({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const { colors, type, space } = theme;
  const { error, retry } = useEnsureAnonymousSignIn();
  return (
    <View style={styles.root}>
      {children}
      {error && (
        <View
          testID="connect-hint"
          accessibilityLiveRegion="polite"
          style={[styles.hint, { backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle, paddingHorizontal: space.s16 }]}
        >
          <Text style={[type.labelS, { color: colors.textSecondary, flexShrink: 1 }]}>Saved on this phone. We will connect when we can.</Text>
          <Pressable testID="connect-retry" accessibilityRole="button" accessibilityLabel="Try again" onPress={retry} style={styles.button}>
            <Text style={[type.labelL, { color: colors.textPrimary }]}>Try again</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hint: { position: 'absolute', left: 16, right: 16, top: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderRadius: 16, minHeight: MIN_TARGET },
  button: { minHeight: MIN_TARGET, minWidth: MIN_TARGET, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
});
