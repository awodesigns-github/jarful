import { Easing } from './primitives';

// From docs/M1-motion-spec.md.
const bez = (a: number, b: number, c: number, d: number) => Easing.bezier(a, b, c, d);
export const EO = bez(0.23, 1, 0.32, 1);
export const EIO = bez(0.77, 0, 0.175, 1);
export const EF = bez(0.32, 0.72, 0, 1);
export const SPRING = (duration: number) => {
  'worklet';
  return { duration, dampingRatio: 1, overshootClamping: true };
};
