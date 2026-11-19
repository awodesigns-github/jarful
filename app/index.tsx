import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigation, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCurrentJar, usePendingNotes, useRevealNote, type RevealResult } from '@/lib/data';
import { Animated, useAnimatedStyle, useReduced, useSharedValue, withSequence, withTiming } from '@/motion/primitives';
import { EIO } from '@/motion/curves';
import { useShake } from '@/motion/useShake';
import { RevealOverlay } from '@/components/reveal/RevealOverlay';
import { Icon } from '@/components/Icon';
import { jarFillLabel } from '@/components/jar/Jar';
import { DropJar } from '@/components/jar/DropJar';
import { useOnline } from '@/components/useOnline';
import { MIN_TARGET, useTheme } from '@/theme';

const DEFAULT_CAPACITY = 30;

type FocusNav = { isFocused: () => boolean; addListener: (e: 'focus' | 'blur', cb: () => void) => () => void };

// Home renders outside a navigator in unit tests.
function useIsHomeFocused(): boolean {
  let nav: FocusNav | null = null;
  try {
    nav = useNavigation() as unknown as FocusNav;
  } catch {
    nav = null;
  }
  const [focused, setFocused] = useState(true);
  useEffect(() => {
    if (!nav) return;
    setFocused(nav.isFocused());
    const a = nav.addListener('focus', () => setFocused(true));
    const b = nav.addListener('blur', () => setFocused(false));
    return () => {
      a();
      b();
    };
  }, [nav]);
  return focused;
}

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

  // Reveal: an overlay inside Home, not a route.
  const reveal = useRevealNote();
  const reduced = useReduced();
  const focused = useIsHomeFocused();
  const [shown, setShown] = useState<{ result: RevealResult; seq: number } | null>(null);
  const seqRef = useRef(0);
  const busy = useRef(false);
  const nudge = useSharedValue(0);
  const nudgeStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${nudge.get()}deg` }] }));
  const open = shown !== null;

  const run = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const result = await reveal();
      seqRef.current += 1;
      setShown({ result, seq: seqRef.current });
    } finally {
      busy.current = false;
    }
  }, [reveal]);

  const onJarPress = () => {
    if (open) return;
    if (!reduced) nudge.set(withSequence(withTiming(-2, { duration: 90, easing: EIO }), withTiming(0, { duration: 90, easing: EIO })));
    void run();
  };
  useShake(focused && !open, () => void run());
  const closeReveal = useCallback(() => setShown(null), []);

  return (
    <View testID="screen-index" style={[styles.root, { backgroundColor: colors.bgBase, paddingTop: insets.top + space.s16 }]}>
      <View style={styles.fill} importantForAccessibility={open ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={open}>
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
        <Pressable
          testID="home-jar"
          accessibilityRole="button"
          accessibilityLabel={jarFillLabel(fill)}
          accessibilityHint="Opens a note from the past"
          onPress={onJarPress}
        >
          <Animated.View style={nudgeStyle}>
            <DropJar total={total} capacity={capacity} width={260} colours={jar?.colours} />
          </Animated.View>
        </Pressable>
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
      {shown && <RevealOverlay result={shown.result} seq={shown.seq} onClose={closeReveal} onAnother={() => void run()} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: MIN_TARGET },
  round: { width: MIN_TARGET, height: MIN_TARGET, borderRadius: 24, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  hint: { textAlign: 'center', maxWidth: 260 },
  fabRow: { alignItems: 'flex-end', paddingBottom: 12 },
  fabShadow: { borderRadius: 999, paddingBottom: 4 },
  fab: { width: 68, height: 68, borderRadius: 34, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  archive: { minHeight: MIN_TARGET + 40, borderWidth: 1.5, paddingTop: 20, justifyContent: 'center' },
});
