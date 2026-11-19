import { Link, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCurrentJar, usePendingNotes } from '@/lib/data';
import { Icon } from '@/components/Icon';
import { jarFillLabel } from '@/components/jar/Jar';
import { DropJar } from '@/components/jar/DropJar';
import { useOnline } from '@/components/useOnline';
import { MIN_TARGET, useTheme } from '@/theme';

const DEFAULT_CAPACITY = 30;

export default function Home() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const online = useOnline();
  const jar = useCurrentJar();
  const { pendingCount } = usePendingNotes();
  const { colors, type, space, radius } = theme;

  const capacity = jar?.capacity ?? DEFAULT_CAPACITY;
  const total = (jar?.noteCount ?? 0) + pendingCount;
  const fill = capacity > 0 ? Math.min(1, total / capacity) : 0;
  const isEmpty = total === 0;

  return (
    <View testID="screen-index" style={[styles.root, { backgroundColor: colors.bgBase, paddingTop: insets.top + space.s16 }]}>
      <View style={[styles.header, { paddingHorizontal: space.s24 }]}>
        <Text accessibilityRole="header" style={[type.displayM, { color: colors.textPrimary }]}>
          Jarful
        </Text>
        <Link href="/settings" asChild>
          <Pressable
            testID="link-settings"
            accessibilityRole="link"
            accessibilityLabel="Settings"
            style={StyleSheet.flatten([styles.round, { backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle }])}
          >
            <Icon name="settings" color={colors.textPrimary} />
          </Pressable>
        </Link>
      </View>

      <View style={styles.stage}>
        <View
          testID="home-jar"
          accessible
          accessibilityRole="image"
          accessibilityLabel={jarFillLabel(fill)}
        >
          <DropJar total={total} capacity={capacity} width={260} />
        </View>
        <Text style={[type.bodyM, styles.hint, { color: colors.textSecondary }]}>
          {isEmpty ? 'Your jar is ready for its first good thing' : 'Add something good whenever you are ready'}
        </Text>
        {!online && (
          <Text testID="home-offline" accessibilityLiveRegion="polite" style={[type.labelS, { color: colors.textSecondary }]}>
            Saved on this phone
          </Text>
        )}
      </View>

      <View style={[styles.fabRow, { paddingHorizontal: space.s24 }]}>
        <View style={[styles.fabShadow, { backgroundColor: colors.accentMuted }]}>
          <Pressable
            testID="home-compose"
            accessibilityRole="button"
            accessibilityLabel="Add a note"
            onPress={() => router.push('/compose')}
            style={({ pressed }) => [
              styles.fab,
              {
                backgroundColor: colors.actionPrimary,
                borderColor: colors.borderStrong,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              },
            ]}
          >
            <Icon name="plus" color={colors.actionOnPrimary} size={28} />
          </Pressable>
        </View>
      </View>

      <Link href="/archive" asChild>
        <Pressable
          testID="link-archive"
          accessibilityRole="link"
          accessibilityLabel="Your archive"
          style={StyleSheet.flatten([
            styles.archive,
            {
              backgroundColor: colors.bgSurface,
              borderColor: colors.borderSubtle,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
              paddingBottom: insets.bottom + space.s16,
              paddingHorizontal: space.s24,
            },
          ])}
        >
          <Text style={[type.titleS, { color: colors.textPrimary }]}>Your archive</Text>
          <Text style={[type.bodyS, { color: colors.textSecondary }]}>
            {isEmpty ? 'Your notes will appear here' : 'Look back at your notes'}
          </Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: MIN_TARGET },
  round: { width: MIN_TARGET, height: MIN_TARGET, borderRadius: 24, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  hint: { textAlign: 'center', maxWidth: 260 },
  fabRow: { alignItems: 'flex-end', paddingBottom: 12 },
  fabShadow: { borderRadius: 999, paddingBottom: 4 },
  fab: { width: 68, height: 68, borderRadius: 34, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  archive: { minHeight: MIN_TARGET + 40, borderWidth: 1.5, paddingTop: 20, justifyContent: 'center' },
});
