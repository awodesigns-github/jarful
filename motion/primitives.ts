// Single import point for the animation runtime, so Jest can swap it for a stub
// (Reanimated needs native runtimes that do not exist under Jest).
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

export { Animated, Easing, ReduceMotion, scheduleOnRN, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming };
/** System reduced-motion setting (Reanimated reads the OS flag). */
export const useReduced = (): boolean => useReducedMotion();
