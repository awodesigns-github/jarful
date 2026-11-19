// Single import point for the animation runtime, so Jest can swap it for a stub
// (Reanimated needs native runtimes that do not exist under Jest).
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

export { Animated, Easing, scheduleOnRN, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming };
/** System reduced-motion setting (Reanimated reads the OS flag). */
export const useReduced = (): boolean => useReducedMotion();
