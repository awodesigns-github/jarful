import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { Link, useNavigation, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCurrentJar, useLastSeal, usePendingNotes, useRevealNote, useShelf, type RevealResult } from '@/lib/data';
import { Animated, ReduceMotion, useAnimatedStyle, useReduced, useSharedValue, withDelay, withSequence, withTiming } from '@/motion/primitives';
import { dropCoordinator } from '@/motion/dropCoordinator';
import { loadPlayedSeals, localSealKey, markSealPlayed, pendingSealId, shouldPlaySeal } from '@/motion/sealPlayed';
import { EIO, EO } from '@/motion/curves';
import { useShake } from '@/motion/useShake';
import { RevealOverlay } from '@/components/reveal/RevealOverlay';
import { Icon } from '@/components/Icon';
import { jarFillLabel } from '@/components/jar/Jar';
import { DropJar } from '@/components/jar/DropJar';
import { SealStage } from '@/components/jar/SealStage';
import { useOnline } from '@/components/useOnline';
import { MIN_TARGET, useTheme } from '@/theme';

const DEFAULT_CAPACITY = 30;
const SEAL_LINE = "Jar full. It's on your shelf now";
const SEAL_LINE_DELAY = 1000; // with the shelf slide
const SEAL_LINE_HOLD = 2400;

/** One calm line after a seal. Fades in, holds, fades out; announced to TalkBack. No counts. */
function SealLine({ color, style, onGone }: { color: string; style: object; onGone: () => void }) {
  const o = useSharedValue(0);
  const style$ = useAnimatedStyle(() => ({ opacity: o.get() }));
  useEffect(() => {
    // A fade, so it also runs under reduced motion.
    const N = ReduceMotion.Never;
    o.set(
      withDelay(
        SEAL_LINE_DELAY,
        withSequence(
          N,
          withTiming(1, { duration: 200, easing: EO, reduceMotion: N }),
          withTiming(1, { duration: SEAL_LINE_HOLD, reduceMotion: N }),
          withTiming(0, { duration: 300, easing: EO, reduceMotion: N }),
        ),
        N,
      ),
    );
    const a = setTimeout(() => AccessibilityInfo.announceForAccessibility(SEAL_LINE), SEAL_LINE_DELAY);
    const g = setTimeout(onGone, SEAL_LINE_DELAY + 200 + SEAL_LINE_HOLD + 300 + 100);
    return () => {
      clearTimeout(a);
      clearTimeout(g);
    };
  }, []);
  return (
    <Animated.View style={style$}>
      <Text testID="seal-line" accessibilityLiveRegion="polite" style={[style, { color }]}>
        {SEAL_LINE}
      </Text>
    </Animated.View>
  );
}

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

  // Seal: the server has sealed the jar (useLastSeal) and Home has not played it yet.
  const lastSeal = useLastSeal();
  const shelf = useShelf();
  const [played, setPlayed] = useState<Set<string> | null>(null);
  const [sealing, setSealing] = useState<string | null>(null);
  const [sealLine, setSealLine] = useState(false);
  const [skipSeq, setSkipSeq] = useState(0);
  const [tick, setTick] = useState(0);
  const sealJarId = lastSeal?.jarId ?? null;
  const openJar = jar ? { jarId: String(jar.jarId), noteCount: jar.noteCount, pendingCount, capacity } : null;
  const waitingSeal = pendingSealId({ sealJarId, played, openJar });
  const sealedColours = sealJarId ? shelf?.find((j) => j.jarId === sealJarId)?.colours : jar?.colours;
  // Sealed on the device but the server has not swapped the jar yet: show the fresh jar, pending overflow counted.
  const [gaveUp, setGaveUp] = useState<ReadonlySet<string>>(new Set());
  const localSealed = !!openJar && !!played && played.has(localSealKey(openJar.jarId)) && !gaveUp.has(openJar.jarId);
  const rawTotal = (jar?.noteCount ?? 0) + pendingCount;
  // Until the seal has played the jar stays full, so the 30th note lands in a full jar.
  const total = waitingSeal || sealing ? capacity : localSealed ? Math.max(0, rawTotal - capacity) : rawTotal;
  const fill = capacity > 0 ? Math.min(1, total / capacity) : 0;
  // Empty only when we know it: the jar answered (or there is nothing pending) and it holds nothing.
  // While the jar is unknown (loading or offline) with nothing pending, show neutral copy.
  const known = jar !== undefined || pendingCount > 0;
  const isEmpty = known && total === 0;

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

  useEffect(() => {
    let alive = true;
    void loadPlayedSeals().then((p) => alive && setPlayed(p));
    return () => {
      alive = false;
    };
  }, []);
  // Wake when a drop has landed, so a seal waiting on it can start.
  useEffect(() => dropCoordinator.subscribe(() => setTick((t) => t + 1)), []);
  useEffect(() => {
    const dropBusy = dropCoordinator.isBusy();
    const id = shouldPlaySeal({ sealJarId, played, openJar, dropBusy, focused, sealing: sealing !== null, revealOpen: open });
    if (id) {
      // Mark before playing, so a restart mid-seal never replays it.
      setPlayed((prev) => new Set(prev ?? []).add(id));
      void markSealPlayed(played ?? new Set(), id);
      setSealing(id);
      setSealLine(true);
      return;
    }
    // A stuck drop stops counting as busy after STALE_MS; look again.
    if (dropBusy && waitingSeal) {
      const t = setTimeout(() => setTick((n) => n + 1), 1000);
      return () => clearTimeout(t);
    }
  }, [sealJarId, played, focused, sealing, open, tick, openJar?.jarId, openJar?.noteCount, openJar?.pendingCount]);
  // The server's seal arrived for a jar already sealed here: record it as played, never replay.
  useEffect(() => {
    if (played && sealJarId && !played.has(sealJarId) && played.has(localSealKey(sealJarId))) {
      setPlayed((prev) => new Set(prev ?? []).add(sealJarId));
      void markSealPlayed(played, sealJarId);
    }
  }, [sealJarId, played]);
  // No server seal within 30 s of being online: trust the server's state, don't loop.
  const staleJarId = localSealed && online && openJar && sealJarId !== openJar.jarId ? openJar.jarId : null;
  useEffect(() => {
    if (!staleJarId) return;
    const t = setTimeout(() => {
      if (__DEV__) console.warn(`[seal] local seal for jar ${staleJarId} was not confirmed by the server; using server state`);
      setGaveUp((prev) => new Set(prev).add(staleJarId));
    }, 30000);
    return () => clearTimeout(t);
  }, [staleJarId]);
  // Leaving Home mid-seal (compose) finishes it cleanly.
  useEffect(() => {
    if (!focused && sealing) setSkipSeq((n) => n + 1);
  }, [focused]);
  const sealDone = useCallback(() => setSealing(null), []);
  const sealGone = useCallback(() => setSealLine(false), []);

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
    if (sealing) {
      setSkipSeq((n) => n + 1);
      return;
    }
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
          accessibilityLabel={sealing ? 'Your jar is full and on your shelf' : jarFillLabel(fill)}
          accessibilityHint={sealing ? undefined : 'Opens a note from the past'}
          onPress={onJarPress}
        >
          <Animated.View style={nudgeStyle}>
            {sealing ? (
              <SealStage width={260} colours={sealedColours} skipSeq={skipSeq} onDone={sealDone} />
            ) : (
              <DropJar total={total} capacity={capacity} width={260} colours={jar?.colours ?? (waitingSeal ? sealedColours : undefined)} />
            )}
          </Animated.View>
        </Pressable>
        {sealLine ? (
          <SealLine color={colors.textSecondary} style={[type.bodyM, styles.hint]} onGone={sealGone} />
        ) : (
        <Text style={[type.bodyM, styles.hint, { color: colors.textSecondary }]}>
          {isEmpty ? 'Your jar is ready for its first good thing' : !known ? 'Your jar is here whenever you are ready' : 'Add something good whenever you are ready'}
        </Text>
        )}
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
