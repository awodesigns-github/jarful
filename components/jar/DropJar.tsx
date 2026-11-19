import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
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
import { useAddNote, useDraft, type MoodName } from '@/lib/data';
import { mood } from '@/theme';
import { EIO, EO, SPRING } from '@/motion/curves';
import { dropCoordinator } from '@/motion/dropCoordinator';
import { landHaptic } from '@/motion/haptics';
import { Jar, JAR_CAPACITY } from './Jar';
import { HIGHLIGHT_PATH } from './slips';

const LINE = '#2e2a26';
const FALL = 86; // px from the top of the lane to just inside the lid
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

type Props = { total: number; capacity?: number; width?: number };

/**
 * The home jar with the drop-in motion (docs/M1-motion-spec.md, section 1).
 * Part 2 of the drop: once Home's transition from compose has ended it adds the note,
 * plays the fall, and lets the jar settle as the new slip appears. All movement is on
 * shared values; the only React state is `held`, changed while no navigation is running.
 */
export function DropJar({ total, capacity = JAR_CAPACITY, width = 260 }: Props) {
  const navigation = useOptionalNavigation();
  const reduced = useReduced();
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
    const colour = dropCoordinator.pending()?.colour as MoodName | undefined;
    const first = totalRef.current === 0;
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
    play(first);
  }, [addNote, clear, reduced]);

  // The compose modal's dismiss has finished when Home's transition ends.
  const startRef = useRef(start);
  startRef.current = start;
  useEffect(() => {
    if (!navigation) return;
    const sub = navigation.addListener('transitionEnd' as never, ((e: { data?: { closing?: boolean } }) => {
      if (!e.data?.closing) void startRef.current();
    }) as never);
    return sub;
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
      <Animated.View style={[{ width, height, transformOrigin: 'bottom' }, jarStyle]}>
        <Jar fill={fill} width={width} />
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, glowStyle]}>
          <Svg width={width} height={height} viewBox="0 8 260 320" fill="none">
            <G transform="translate(0 -5.382)">
              <Path d={HIGHLIGHT_PATH} stroke="#ffffff" strokeWidth={10} strokeLinecap="round" />
            </G>
          </Svg>
        </Animated.View>
      </Animated.View>
      {/* The lane above the lid: the slip is clipped where it enters the jar. */}
      <View pointerEvents="none" style={[styles.lane, { height: FALL, top: -FALL + 6 }]}>
        <Animated.View style={[styles.slip, slipStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lane: { position: 'absolute', left: 0, right: 0, overflow: 'hidden', alignItems: 'center' },
  slip: { position: 'absolute', top: 0, width: SLIP_W, height: SLIP_H, borderRadius: 7, borderWidth: 2, borderColor: LINE },
});
