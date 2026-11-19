import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import {
  Animated,
  ReduceMotion,
  scheduleOnRN,
  useAnimatedStyle,
  useReduced,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from '@/motion/primitives';
import { EIO, EO } from '@/motion/curves';
import { sealHaptic } from '@/motion/haptics';
import { Jar, JarLid } from './Jar';
import { HIGHLIGHT_PATH } from './slips';

/**
 * Seal timings in ms from the stage mounting (docs/M1-motion-spec.md, section 3, with a short
 * lift-and-wait up front so the lid can come down on the open jar). No bounce, no overshoot.
 */
export const SEAL = {
  lidLift: 160, // lid rises and fades, EO
  lidDown: 400, // lid lowers onto the jar, EO
  lidStart: 300,
  seat: 700, // lidStart + lidDown: Success haptic here
  glow: 600, // highlight 0 to 0.4 to 0, EIO, from the seat
  shelfStart: 800,
  shelf: 600, // jar scale 1 to 0.45, slides toward the archive, fades, EIO
  freshStart: 1100,
  fresh: 400, // fresh jar rises in, EO
  end: 1500,
  skip: 150,
  reducedFade: 200, // reduced motion: crossfade full jar to empty jar
  reducedStart: 180, // haptic here
  failsafe: 4000,
} as const;
const LIFT = 28;
const SHELF_Y = 170;
const SHELF_SCALE = 0.45;

type Props = {
  width: number;
  colours?: (string | null)[];
  /** Bump to skip to the end state with a short fade (a tap on the jar). */
  skipSeq: number;
  /** Called once, when the fresh jar is at rest. Always called, even if skipped or interrupted. */
  onDone: () => void;
};

/**
 * The seal moment: the full jar gets its lid, glows, slides toward the shelf and fades while a
 * fresh empty jar rises in. All movement is on shared values; React only mounts and unmounts it.
 */
export function SealStage({ width, colours, skipSeq, onDone }: Props) {
  const reduced = useReduced();
  const height = (width * 320) / 260;
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const lidY = useSharedValue(0);
  const lidOpacity = useSharedValue(1);
  const glow = useSharedValue(0);
  const oldP = useSharedValue(0); // 0 on the shelf-less jar, 1 gone to the shelf
  const freshP = useSharedValue(0);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDoneRef.current();
  }, []);

  useEffect(() => {
    // Failsafe, as in the drop coordinator: a stuck stage releases itself.
    const failsafe = setTimeout(finish, SEAL.failsafe);
    if (reduced) {
      // Reduced motion is a short crossfade, so these fades must still run: opt out of Reanimated's
      // system skip, which would otherwise jump straight to the end value.
      const fade = { duration: SEAL.reducedFade, easing: EO, reduceMotion: ReduceMotion.Never };
      oldP.set(withDelay(SEAL.reducedStart, withTiming(1, fade), ReduceMotion.Never));
      freshP.set(
        withDelay(
          SEAL.reducedStart,
          withTiming(1, fade, () => {
            'worklet';
            scheduleOnRN(finish);
          }),
          ReduceMotion.Never,
        ),
      );
      const h = setTimeout(sealHaptic, SEAL.reducedStart);
      return () => {
        clearTimeout(failsafe);
        clearTimeout(h);
      };
    }
    lidOpacity.set(
      withSequence(
        withTiming(0, { duration: SEAL.lidLift, easing: EO }),
        withTiming(0, { duration: SEAL.lidStart - SEAL.lidLift }),
        withTiming(1, { duration: 120, easing: EO }),
      ),
    );
    lidY.set(
      withSequence(
        withTiming(-LIFT, { duration: SEAL.lidLift, easing: EO }),
        withTiming(-LIFT, { duration: SEAL.lidStart - SEAL.lidLift }),
        withTiming(0, { duration: SEAL.lidDown, easing: EO }, (ok) => {
          'worklet';
          if (ok) scheduleOnRN(sealHaptic); // same frame as the lid seating
        }),
      ),
    );
    glow.set(
      withDelay(
        SEAL.seat,
        withSequence(
          withTiming(0.4, { duration: SEAL.glow / 2, easing: EIO }),
          withTiming(0, { duration: SEAL.glow / 2, easing: EIO }),
        ),
      ),
    );
    oldP.set(withDelay(SEAL.shelfStart, withTiming(1, { duration: SEAL.shelf, easing: EIO })));
    freshP.set(
      withDelay(
        SEAL.freshStart,
        withTiming(1, { duration: SEAL.fresh, easing: EO }, () => {
          'worklet';
          scheduleOnRN(finish);
        }),
      ),
    );
    return () => clearTimeout(failsafe);
  }, []);

  // A tap on the jar: jump to the end state with a short fade; leaving Home (compose) is the same.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    lidY.set(0);
    lidOpacity.set(1);
    glow.set(0);
    oldP.set(withTiming(1, { duration: SEAL.skip, easing: EO }));
    freshP.set(
      withTiming(1, { duration: SEAL.skip, easing: EO }, () => {
        'worklet';
        scheduleOnRN(finish);
      }),
    );
  }, [skipSeq]);

  const oldStyle = useAnimatedStyle(() => {
    const p = oldP.get();
    if (reduced) return { opacity: 1 - p };
    return {
      opacity: 1 - p,
      transform: [{ translateY: p * SHELF_Y }, { scale: 1 - p * (1 - SHELF_SCALE) }],
    };
  });
  const lidStyle = useAnimatedStyle(() => ({ opacity: lidOpacity.get(), transform: [{ translateY: lidY.get() }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.get() }));
  const freshStyle = useAnimatedStyle(() => {
    const p = freshP.get();
    if (reduced) return { opacity: p };
    return { opacity: p, transform: [{ translateY: 8 * (1 - p) }, { scale: 0.96 + 0.04 * p }] };
  });

  return (
    <View testID="seal-stage" style={{ width, height }}>
      <Animated.View style={[StyleSheet.absoluteFill, freshStyle]}>
        <Jar fill={0} width={width} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, oldStyle]}>
        <Jar fill={1} width={width} colours={colours} lid={false} />
        <Animated.View style={[StyleSheet.absoluteFill, glowStyle]}>
          <Svg width={width} height={height} viewBox="0 8 260 320" fill="none">
            <G transform="translate(0 -5.382)">
              <Path d={HIGHLIGHT_PATH} stroke="#ffffff" strokeWidth={10} strokeLinecap="round" />
            </G>
          </Svg>
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, lidStyle]}>
          <JarLid width={width} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}
