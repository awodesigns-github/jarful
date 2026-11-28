import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useNavigation } from 'expo-router';
import {
  Animated,
  scheduleOnRN,
  useAnimatedStyle,
  useReduced,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from '@/motion/primitives';
import Svg, { G, Path } from 'react-native-svg';
import { useRiveFile } from '@rive-app/react-native';
import { useAddNote, useDraft, type MoodName } from '@/lib/data';
import { mood, useTheme } from '@/theme';
import { EIO, EO, SPRING } from '@/motion/curves';
import { dropCoordinator } from '@/motion/dropCoordinator';
import { landHaptic } from '@/motion/haptics';
import { Jar, JAR_CAPACITY } from './Jar';
import { HIGHLIGHT_PATH } from './slips';
import { RiveNoteDrop, type RiveDropNote } from './RiveNoteDrop';
import { jarSlots, landingSlot, noteColours, slipColours, type LandingSlot } from './riveNoteDrop';

/** The drop-in scene (rive/note-drop, built with `rive . --publish`). */
const NOTE_DROP_RIV = require('@/assets/rive/note-drop.riv');

type RiveDrop = { note: RiveDropNote; slots: number; landing: LandingSlot; slipColours: string[] };

const LINE = '#2e2a26';
const FALL = 86; // px from the top of the lane to just inside the lid
/** Fallback if no transitionEnd arrives after focus; longer than a modal dismissal. */
const HANDOFF_FALLBACK_MS = Platform.OS === 'ios' ? 400 : 700;
const SLIP_W = 48;
const SLIP_H = 30;

// Home renders outside a navigator in unit tests.
function useOptionalNavigation() {
  try {
    return useNavigation();
  } catch {
    return null;
  }
}

type Props = {
  total: number;
  capacity?: number;
  width?: number;
  colours?: (string | null)[];
};

/**
 * The home jar with the drop-in motion.
 * Once Home's transition from compose has ended it adds the note and plays the drop: the Rive
 * scene (fold, drop onto the next slip, wobble; docs/decisions.md 2026-11-27) laid over this jar,
 * or, with reduced motion or if the scene cannot start, the Reanimated fall and fades
 * (docs/M1-motion-spec.md, section 1). React state (`held`, `riveDrop`, `riveShowing`) only
 * changes while no navigation is running.
 */
export function DropJar({ total, capacity = JAR_CAPACITY, width = 260, colours }: Props) {
  const navigation = useOptionalNavigation();
  const reduced = useReduced();
  const { theme } = useTheme();
  const { riveFile } = useRiveFile(NOTE_DROP_RIV);
  const [riveDrop, setRiveDrop] = useState<RiveDrop | null>(null);
  const [riveShowing, setRiveShowing] = useState(false); // the scene covers the jar: hide ours
  const coloursRef = useRef(colours);
  coloursRef.current = colours;
  const capacityRef = useRef(capacity);
  capacityRef.current = capacity;
  const addNote = useAddNote();
  const { clear } = useDraft();
  const [held, setHeld] = useState(0); // slips not yet shown, until the note lands
  const totalRef = useRef(total);
  totalRef.current = total;

  const fall = useSharedValue(0);
  const slipOpacity = useSharedValue(0);
  const slipColour = useSharedValue<string>(mood.yellow);
  const jarScale = useSharedValue(1);
  const jarOpacity = useSharedValue(1);
  const glow = useSharedValue(0);

  const landed = useCallback(() => {
    landHaptic();
    setHeld(0);
    dropCoordinator.landed();
  }, []);

  const play = (first: boolean) => {
    const settle = () => {
      'worklet';
      if (first) {
        jarScale.set(withSequence(withTiming(0.975, { duration: 90, easing: EO }), withSpring(1, SPRING(500))));
        glow.set(
          withSequence(withTiming(0.35, { duration: 300, easing: EIO }), withTiming(0, { duration: 300, easing: EIO })),
        );
      } else {
        jarScale.set(withSequence(withTiming(0.985, { duration: 90, easing: EO }), withSpring(1, SPRING(400))));
      }
    };
    fall.set(0);
    if (reduced) {
      // Short fades only: the slip fades in and out at the mouth, the level crossfades.
      fall.set(0.5);
      slipOpacity.set(
        withTiming(1, { duration: 180, easing: EO }, (finished) => {
          'worklet';
          // Always release the coordinator, or an interrupted drop would block every later one.
          if (!finished) {
            scheduleOnRN(landed);
            return;
          }
          slipOpacity.set(withTiming(0, { duration: 150, easing: EO }));
          jarOpacity.set(withSequence(withTiming(0.85, { duration: 0 }), withTiming(1, { duration: 200, easing: EO })));
          scheduleOnRN(landed);
        }),
      );
      return;
    }
    slipOpacity.set(1);
    fall.set(
      withTiming(1, { duration: 420, easing: EIO }, (finished) => {
        'worklet';
        if (!finished) {
          scheduleOnRN(landed);
          return;
        }
        slipOpacity.set(0);
        settle(); // same frame as the haptic below
        scheduleOnRN(landed);
      }),
    );
  };

  const start = useCallback(async () => {
    if (dropCoordinator.phase() !== 'leaving') return;
    const pending = dropCoordinator.pending();
    const colour = pending?.colour as MoodName | undefined;
    const before = totalRef.current;
    const first = before === 0;
    slipColour.set(colour ? mood[colour] : mood.yellow);
    setHeld(1);
    const ok = await dropCoordinator.dismissed({
      addNote: (n) => addNote({ text: n.text, colour: n.colour as MoodName | undefined }),
      clear,
    });
    if (!ok) {
      setHeld(0); // the add failed: the draft is still in compose
      return;
    }
    if (reduced || !riveFile || !pending) {
      play(first);
      return;
    }
    const cap = capacityRef.current;
    setRiveDrop({
      note: { text: pending.text, ...noteColours(colour ? mood[colour] : undefined, theme.colors) },
      slots: jarSlots(before, cap),
      landing: landingSlot(before, cap),
      slipColours: slipColours(coloursRef.current ?? undefined, mood),
    });
  }, [addNote, clear, reduced, riveFile, theme]);

  // Rive drop callbacks. The scene lands on the slot our jar shows next, so when it ends our jar
  // (lid back, new slip in place) takes over with nothing moving.
  const riveShowingRef = useRef(false);
  riveShowingRef.current = riveShowing;
  const riveFirstRef = useRef(false);
  riveFirstRef.current = !!riveDrop && riveDrop.slots === 0;
  const onRiveReady = useCallback(() => setRiveShowing(true), []);
  // Touchdown: haptic and the new slip (hidden under the scene until it ends).
  const onRiveLanded = useCallback(() => {
    landHaptic();
    setHeld(0);
  }, []);
  // The scene has ended: our jar takes over, then the coordinator is released (a waiting seal
  // starts only now, never under the scene).
  const onRiveDone = useCallback(() => {
    setRiveShowing(false);
    setRiveDrop(null);
    setHeld(0);
    dropCoordinator.landed();
  }, []);
  const onRiveFail = useCallback(() => {
    // Could not start (or broke mid-way): fall back to the Reanimated drop, or finish cleanly.
    const wasShowing = riveShowingRef.current;
    setRiveShowing(false);
    setRiveDrop(null);
    if (wasShowing) landed();
    else play(riveFirstRef.current);
  }, [landed]);

  // The compose modal's dismiss has finished when Home's transition ends (Android) or, where the
  // sheet dismissal sends no transitionEnd to this screen (iOS, BUG-6), when Home regains focus.
  // Focus alone fires as the dismissal begins, so it only arms a short fallback timer
  // (BUG-3: nothing writes state while the modal is still closing). start() guards double runs.
  const startRef = useRef(start);
  startRef.current = start;
  useEffect(() => {
    if (!navigation) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clearTimer = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
    };
    const run = () => {
      clearTimer();
      void startRef.current();
    };
    const onEnd = navigation.addListener(
      'transitionEnd' as never,
      ((e: { data?: { closing?: boolean } }) => {
        if (!e.data?.closing) run();
      }) as never,
    );
    const onFocus = navigation.addListener(
      'focus' as never,
      (() => {
        if (dropCoordinator.phase() !== 'leaving') return;
        clearTimer();
        timer = setTimeout(run, HANDOFF_FALLBACK_MS);
      }) as never,
    );
    return () => {
      clearTimer();
      onEnd();
      onFocus();
    };
  }, [navigation]);

  const jarStyle = useAnimatedStyle(() => ({
    opacity: jarOpacity.get(),
    transform: [{ scaleY: jarScale.get() }],
  }));
  const slipStyle = useAnimatedStyle(() => {
    const p = fall.get();
    return {
      opacity: slipOpacity.get(),
      backgroundColor: slipColour.get(),
      transform: [{ translateY: p * FALL }, { rotate: `${-4 - 8 * p}deg` }],
    };
  });
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.get() }));

  const shown = Math.max(0, total - held);
  const fill = capacity > 0 ? Math.min(1, shown / capacity) : 0;
  const height = (width * 320) / 260;

  return (
    <View style={{ width, height }}>
      {/* Hidden (not unmounted) while the Rive scene covers it. */}
      <View testID="drop-jar-art" style={{ opacity: riveShowing ? 0 : 1 }}>
      <Animated.View style={[{ width, height, transformOrigin: 'bottom' }, jarStyle]}>
        <Jar fill={fill} width={width} colours={colours} />
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, glowStyle]}>
          <Svg width={width} height={height} viewBox="0 8 260 320" fill="none">
            <G transform="translate(0 -5.382)">
              <Path d={HIGHLIGHT_PATH} stroke="#ffffff" strokeWidth={10} strokeLinecap="round" />
            </G>
          </Svg>
        </Animated.View>
      </Animated.View>
      </View>
      {/* The lane above the lid: the slip is clipped where it enters the jar. */}
      <View pointerEvents="none" style={[styles.lane, { height: FALL, top: -FALL + 6 }]}>
        <Animated.View style={[styles.slip, slipStyle]} />
      </View>
      {riveDrop && riveFile && (
        <RiveNoteDrop
          file={riveFile}
          width={width}
          note={riveDrop.note}
          slots={riveDrop.slots}
          landing={riveDrop.landing}
          slipColours={riveDrop.slipColours}
          theme={{ glass: theme.colors.jarGlass, line: theme.colors.jarLine, label: theme.colors.bgBase }}
          onReady={onRiveReady}
          onLanded={onRiveLanded}
          onDone={onRiveDone}
          onFail={onRiveFail}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  lane: {
    position: 'absolute',
    left: 0,
    right: 0,
    overflow: 'hidden',
    alignItems: 'center',
  },
  slip: {
    position: 'absolute',
    top: 0,
    width: SLIP_W,
    height: SLIP_H,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: LINE,
  },
});
