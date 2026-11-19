// Single import point for the animation runtime, so Jest can swap it for a stub
// (Reanimated needs native runtimes that do not exist under Jest).
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay as rnWithDelay,
  withSequence as rnWithSequence,
  withSpring as rnWithSpring,
  withTiming as rnWithTiming,
} from 'react-native-reanimated';
import { useSettings } from '@/lib/data';
import { resolveReducedMotion } from './reducedMotion';
import { scheduleOnRN } from 'react-native-worklets';

export { Animated, Easing, ReduceMotion, scheduleOnRN, useAnimatedStyle, useSharedValue };

// BUG-9: Reanimated skips any animation left on ReduceMotion.System when the OS flag is on, so a
// reduced-motion fade would jump. The app decides reduced motion itself (useReduced), so every
// animation runs with ReduceMotion.Never unless a caller says otherwise.
export const withTiming = ((to, config, cb) => {
  'worklet';
  return rnWithTiming(to, { reduceMotion: ReduceMotion.Never, ...config }, cb);
}) as typeof rnWithTiming;
export const withSpring = ((to, config, cb) => {
  'worklet';
  return rnWithSpring(to, { reduceMotion: ReduceMotion.Never, ...config }, cb);
}) as typeof rnWithSpring;
export const withDelay: typeof rnWithDelay = (ms, anim, rm) => {
  'worklet';
  return rnWithDelay(ms, anim, rm ?? ReduceMotion.Never);
};
export const withSequence = ((...a: unknown[]) => {
  'worklet';
  const seq = rnWithSequence as (...x: unknown[]) => unknown;
  return typeof a[0] === 'string' ? seq(...a) : seq(ReduceMotion.Never, ...a);
}) as typeof rnWithSequence;

/** Reduced motion: the in-app setting (system, on, off) combined with the OS flag. */
export const useReduced = (): boolean => resolveReducedMotion(useSettings().reducedMotion, useReducedMotion());
