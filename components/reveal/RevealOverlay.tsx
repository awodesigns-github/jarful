import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, BackHandler, findNodeHandle, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Animated,
  scheduleOnRN,
  useAnimatedStyle,
  useReduced,
  useSharedValue,
  withSequence,
  withDelay,
  withTiming,
} from '@/motion/primitives';
import { EF, EIO, EO } from '@/motion/curves';
import { revealHaptic, selectHaptic } from '@/motion/haptics';
import { useSetFavourite, type RevealResult, type RevealedNote } from '@/lib/data';
import { Icon } from '@/components/Icon';
import { NEUTRAL_SLIP } from '@/components/jar/slips';
import { MIN_TARGET, mood, useTheme } from '@/theme';
import { ageLabel, dateLabel } from './age';
import { toggleFavourite } from './favourite';

const INK = '#2e2a26';
export const NONE_YET_TEXT = "Keep adding good things; they'll come back to you here";
export const OFFLINE_TEXT = "Your past notes come back when you're online";

type Props = {
  result: RevealResult;
  /** Bumps for each reveal so the card remounts and replays. */
  seq: number;
  onClose: () => void;
  onAnother: () => void;
};

/**
 * The reveal, drawn over Home (not a route: screen transitions and state changes crash Fabric, BUG-3).
 * docs/M1-motion-spec.md section 2: rise 120-620 (EO), unfold 520-900 (EF), exit 200 (EO).
 * Reduced motion: the card fades in over 180 and out over 150, with no movement.
 */
export function RevealOverlay({ result, seq, onClose, onAnother }: Props) {
  const { theme } = useTheme();
  const { colors, space } = theme;
  const insets = useSafeAreaInsets();
  const reduced = useReduced();
  const { width: winW } = useWindowDimensions();
  const backdrop = useSharedValue(0);
  const exit = useSharedValue(0);
  const closing = useRef(false);

  useEffect(() => {
    backdrop.set(withTiming(1, { duration: reduced ? 180 : 200, easing: EO }));
  }, [backdrop, reduced]);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    exit.set(
      withTiming(1, { duration: reduced ? 150 : 200, easing: EO }, (finished) => {
        'worklet';
        scheduleOnRN(onClose);
      }),
    );
  }, [exit, onClose, reduced]);

  // Android back closes the overlay, not the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [close]);

  const rootStyle = useAnimatedStyle(() => ({
    opacity: 1 - exit.get(),
    transform: reduced ? [] : [{ translateY: 24 * exit.get() }, { scaleY: 1 - 0.03 * exit.get() }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.get() }));

  const ok = result.status === 'ok';
  const cardW = Math.min(342, winW - 48);

  return (
    <View
      testID="reveal-overlay"
      style={[StyleSheet.absoluteFill, styles.overlay]}
      accessibilityViewIsModal
      importantForAccessibility="yes"
    >
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.bgBase }, backdropStyle]} />
      <Pressable
        testID="reveal-backdrop"
        accessible={false}
        importantForAccessibility="no"
        style={StyleSheet.absoluteFill}
        onPress={close}
      />
      <Animated.View pointerEvents="box-none" style={[styles.fill, { paddingTop: insets.top + space.s16 }, rootStyle]}>
        {ok ? (
          <RevealCard key={seq} note={result.note} width={cardW} reduced={reduced} onClose={close} onAnother={onAnother} bottomInset={insets.bottom} />
        ) : (
          <MessagePanel
            key={seq}
            testID={result.status === 'offline' ? 'reveal-offline' : 'reveal-empty'}
            text={result.status === 'offline' ? OFFLINE_TEXT : NONE_YET_TEXT}
            onClose={close}
            bottomInset={insets.bottom}
          />
        )}
      </Animated.View>
    </View>
  );
}

function CloseButton({ onPress }: { onPress: () => void }) {
  const { theme } = useTheme();
  const { colors } = theme;
  return (
    <Pressable
      testID="reveal-close"
      accessibilityRole="button"
      accessibilityLabel="Close"
      onPress={onPress}
      style={[styles.round, { backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle }]}
    >
      <Icon name="close" color={colors.textPrimary} />
    </Pressable>
  );
}

function MessagePanel({ text, testID, onClose, bottomInset }: { text: string; testID: string; onClose: () => void; bottomInset: number }) {
  const { theme } = useTheme();
  const { colors, type } = theme;
  const reduced = useReduced();
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withTiming(1, { duration: 180, easing: EO }));
    const t = setTimeout(() => AccessibilityInfo.announceForAccessibility(text), 150);
    return () => clearTimeout(t);
  }, [p, text]);
  const style = useAnimatedStyle(() => ({
    opacity: p.get(),
    transform: reduced ? [] : [{ translateY: 8 * (1 - p.get()) }],
  }));
  return (
    <>
      <View style={styles.topRow}>
        <CloseButton onPress={onClose} />
      </View>
      <View style={styles.middle} pointerEvents="box-none">
        <Animated.View
          accessible
          accessibilityRole="alert"
          testID={testID}
          style={[styles.panel, { backgroundColor: colors.actionPrimary }, style]}
        >
          <Text style={[type.labelM, { color: colors.actionOnPrimary, fontSize: 17, lineHeight: 24, textAlign: 'center' }]}>{text}</Text>
        </Animated.View>
      </View>
      <View style={{ height: bottomInset + 96 }} />
    </>
  );
}

function RevealCard({
  note,
  width,
  reduced,
  onClose,
  onAnother,
  bottomInset,
}: {
  note: RevealedNote;
  width: number;
  reduced: boolean;
  onClose: () => void;
  onAnother: () => void;
  bottomInset: number;
}) {
  const { theme } = useTheme();
  const { colors, type } = theme;
  const setFavourite = useSetFavourite();
  const [fav, setFav] = useState(note.isFavourite);
  const favRef = useRef(fav);
  favRef.current = fav;

  const r = useSharedValue(0); // rise
  const u = useSharedValue(0); // unfold
  const heart = useSharedValue(note.isFavourite ? 1 : 0); // fill crossfade
  const pulse = useSharedValue(1);
  const toast = useSharedValue(0);
  const settled = useRef(false);
  const cardRef = useRef<React.ComponentRef<typeof Pressable>>(null);

  useEffect(() => {
    let hap: ReturnType<typeof setTimeout> | undefined;
    if (reduced) {
      r.set(1);
      u.set(withTiming(1, { duration: 180, easing: EO }));
    } else {
      r.set(withDelay(120, withTiming(1, { duration: 500, easing: EO })));
      u.set(withDelay(520, withTiming(1, { duration: 380, easing: EF })));
      hap = setTimeout(revealHaptic, 120); // the slip reaches the rim
    }
    const done = setTimeout(() => (settled.current = true), reduced ? 180 : 900);
    // TalkBack: read the note and put focus on the card.
    const ann = setTimeout(() => {
      AccessibilityInfo.announceForAccessibility(note.text);
      const h = findNodeHandle(cardRef.current as never);
      if (h) AccessibilityInfo.setAccessibilityFocus(h);
    }, 100);
    return () => {
      if (hap) clearTimeout(hap);
      clearTimeout(done);
      clearTimeout(ann);
    };
  }, [r, u, reduced, note.text]);

  const skip = () => {
    if (settled.current) return;
    settled.current = true;
    r.set(withTiming(1, { duration: 150, easing: EO }));
    u.set(withTiming(1, { duration: 150, easing: EO }));
  };

  const cardStyle = useAnimatedStyle(() => {
    if (reduced) return { opacity: u.get() };
    const rise = r.get();
    const un = u.get();
    return {
      opacity: Math.min(1, (rise * 500) / 120),
      transform: [{ translateY: (1 - rise) * 160 }, { scaleX: 0.85 + 0.15 * un }, { scaleY: 0.35 + 0.65 * un }],
    };
  });
  const textStyle = useAnimatedStyle(() => ({
    opacity: reduced ? 1 : Math.max(0, Math.min(1, (u.get() - 0.316) / 0.684)),
  }));
  const controlsStyle = useAnimatedStyle(() => ({ opacity: u.get() }));
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.get() }] }));
  const filledStyle = useAnimatedStyle(() => ({ opacity: heart.get() }));
  const toastStyle = useAnimatedStyle(() => ({ opacity: toast.get() }));

  const onHeart = async () => {
    const was = favRef.current;
    selectHaptic();
    heart.set(withTiming(was ? 0 : 1, { duration: 150, easing: EO }));
    if (!reduced) pulse.set(withSequence(withTiming(1.12, { duration: 110, easing: EIO }), withTiming(1, { duration: 110, easing: EIO })));
    if (!was) toast.set(withSequence(withTiming(1, { duration: 150, easing: EO }), withTiming(1, { duration: 1200 }), withTiming(0, { duration: 200, easing: EO })));
    else toast.set(withTiming(0, { duration: 100, easing: EO }));
    const end = await toggleFavourite({
      current: was,
      apply: setFav,
      save: (next) => setFavourite(note._id as never, next),
    });
    if (end === was) {
      // The save was refused: put the heart (and the label) back.
      heart.set(withTiming(was ? 1 : 0, { duration: 150, easing: EO }));
      toast.set(withTiming(0, { duration: 100, easing: EO }));
    }
  };

  const paper = note.colour && note.colour in mood ? mood[note.colour as keyof typeof mood] : NEUTRAL_SLIP;
  const date = dateLabel(note.createdAt);

  return (
    <>
      <Animated.View style={[styles.topRow, controlsStyle]}>
        <CloseButton onPress={onClose} />
        <Text style={[type.labelM, { color: colors.textSecondary, flex: 1 }]}>From your jar · {ageLabel(note.createdAt)}</Text>
      </Animated.View>

      <View style={styles.middle} pointerEvents="box-none">
        <Animated.View style={[{ width, paddingBottom: 6, borderRadius: 32, backgroundColor: INK }, cardStyle]}>
          <Pressable
            ref={cardRef}
            onPress={skip}
            accessible
            accessibilityLabel={`${note.text}. ${date}`}
            style={[styles.card, { backgroundColor: paper }]}
          >
            <Animated.View style={textStyle}>
              <Text testID="reveal-text" style={[type.noteL, { color: INK, fontSize: 28, lineHeight: 38 }]}>
                {note.text}
              </Text>
              <Text style={[type.labelM, { color: INK, opacity: 0.7, marginTop: 28 }]}>{date}</Text>
            </Animated.View>
          </Pressable>
        </Animated.View>
      </View>

      <Animated.View style={controlsStyle}>
        <View style={styles.linkSlot}>
          <Pressable
            testID="reveal-another"
            accessibilityRole="button"
            accessibilityLabel="Show another note"
            onPress={onAnother}
            style={styles.link}
          >
            <Text style={[type.bodyS, { color: colors.textSecondary }]}>Tap here or shake for another</Text>
          </Pressable>
          <Animated.View
            pointerEvents="none"
            accessibilityLiveRegion="polite"
            style={[styles.toast, { backgroundColor: colors.actionPrimary }, toastStyle]}
          >
            <Text style={[type.labelM, { color: colors.actionOnPrimary }]}>Saved to favourites</Text>
          </Animated.View>
        </View>
        <View style={[styles.bottomRow, { paddingBottom: bottomInset + 24 }]}>
          <Animated.View style={heartStyle}>
            <Pressable
              testID="reveal-favourite"
              accessibilityRole="button"
              accessibilityLabel={fav ? 'Remove from favourites' : 'Add to favourites'}
              accessibilityState={{ selected: fav }}
              onPress={onHeart}
              style={[styles.heart, { backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle }]}
            >
              <Icon name="heart" color={colors.textPrimary} />
              <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center, filledStyle]}>
                <Icon name="heart" color={colors.accentMuted} fill={colors.accentMuted} />
              </Animated.View>
            </Pressable>
          </Animated.View>
          <Pressable
            testID="reveal-back"
            accessibilityRole="button"
            accessibilityLabel="Back to jar"
            onPress={onClose}
            style={({ pressed }) => [
              styles.back,
              { backgroundColor: colors.bgSurface, borderColor: colors.borderStrong, transform: [{ scale: pressed ? 0.97 : 1 }] },
            ]}
          >
            <Text style={[type.labelL, { color: colors.textPrimary }]}>Back to jar</Text>
          </Pressable>
        </View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { zIndex: 10, elevation: 10 },
  fill: { flex: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 22, minHeight: MIN_TARGET },
  round: { width: MIN_TARGET, height: MIN_TARGET, borderRadius: 24, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 32, borderWidth: 2.5, borderColor: INK, padding: 26, minHeight: 300, justifyContent: 'space-between' },
  panel: { borderRadius: 18, paddingHorizontal: 20, paddingVertical: 18, marginHorizontal: 40, maxWidth: 300 },
  linkSlot: { minHeight: MIN_TARGET, alignItems: 'center', justifyContent: 'center' },
  link: { minHeight: MIN_TARGET, justifyContent: 'center', paddingHorizontal: 16 },
  toast: { position: 'absolute', borderRadius: 999, paddingHorizontal: 20, paddingVertical: 12 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 24, paddingTop: 12 },
  heart: { width: 56, height: 56, borderRadius: 28, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  back: { flex: 1, height: 56, borderRadius: 999, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
