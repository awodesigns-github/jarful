import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEnsureAnonymousSignIn } from '@/lib/data';
import { MIN_TARGET, useTheme } from '@/theme';

/** Calm loading and gentle retry while the anonymous session starts. No red, no alarms. */
export function ConnectGate({ children }: { children: ReactNode }) {
  const [attempt, setAttempt] = useState(0);
  // Remounting resets the hook's single-attempt guard, which is how retry works.
  return <GateInner key={attempt} onRetry={() => setAttempt((a) => a + 1)}>{children}</GateInner>;
}

function GateInner({ children, onRetry }: { children: ReactNode; onRetry: () => void }) {
  const { theme } = useTheme();
  const { colors, type, space, radius } = theme;
  const { isReady, error } = useEnsureAnonymousSignIn();
  if (isReady) return <>{children}</>;
  return (
    <View testID="connect-gate" accessible accessibilityLabel={error ? 'Could not reach your jar yet' : 'Opening your jar'} style={[styles.root, { backgroundColor: colors.bgBase, padding: space.s24, gap: space.s16 }]}>
      {error ? (
        <>
          <Text style={[type.titleM, { color: colors.textPrimary, textAlign: 'center' }]}>Your jar is taking a moment</Text>
          <Text style={[type.bodyM, { color: colors.textSecondary, textAlign: 'center' }]}>We could not connect just now. Nothing is lost. Check your connection and try again.</Text>
          <Pressable
            testID="connect-retry"
            accessibilityRole="button"
            accessibilityLabel="Try again"
            onPress={onRetry}
            style={[styles.button, { backgroundColor: colors.actionPrimary, borderRadius: radius.pill, paddingHorizontal: space.s24 }]}
          >
            <Text style={[type.labelL, { color: colors.actionOnPrimary }]}>Try again</Text>
          </Pressable>
        </>
      ) : (
        <ActivityIndicator testID="connect-loading" color={colors.textSecondary} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  button: { minHeight: MIN_TARGET, minWidth: MIN_TARGET, alignItems: 'center', justifyContent: 'center' },
});
