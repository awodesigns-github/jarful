import { StyleSheet, Text, View, type TextStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { Animated, useAnimatedStyle } from '@/motion/primitives';

const PERSPECTIVE = 900;
const RADIUS = 24;

type Props = {
  width: number;
  height: number;
  text: string;
  tint?: string;
  paper: string;
  border: string;
  ink: string;
  textStyle: TextStyle;
  bottom: SharedValue<number>; // 0..1, bottom third folds up over the middle (180 deg)
  top: SharedValue<number>; // 0..1, top third folds down over it (180 deg)
  slip: SharedValue<number>; // 0..1, the folded slip tilts and shrinks
};

/**
 * The letter fold (docs/decisions.md). The note is cut into three horizontal panels hinged at
 * the creases. Each moving panel is two sibling views carrying the same rotateX, one front (the
 * text) and one back (plain paper), both backfaceVisibility hidden, so whichever faces the
 * viewer shows. All values are shared values; nothing here re-renders during the fold.
 */
export function NoteFold({ width, height, text, tint, paper, border, ink, textStyle, bottom, top, slip }: Props) {
  const h = height / 3;

  const Paper = ({ withText }: { withText: boolean }) => (
    <View style={[styles.paper, { width, height, backgroundColor: paper, borderColor: tint ?? border }]}>
      {tint && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tint, opacity: 0.18 }]} />
      )}
      {withText && <Text style={[textStyle, styles.text, { color: ink }]}>{text}</Text>}
    </View>
  );

  // Panels darken as they pass 90 degrees; the creases get a soft shadow line.
  const shade = (p: SharedValue<number>) => () => {
    'worklet';
    return {
      opacity: 0.22 * Math.sin(Math.min(1, Math.max(0, p.get())) * Math.PI),
    };
  };
  const crease = (p: SharedValue<number>) => () => {
    'worklet';
    return {
      opacity: 0.5 * Math.sin(Math.min(1, Math.max(0, p.get())) * Math.PI),
    };
  };
  const bottomShade = useAnimatedStyle(shade(bottom));
  const topShade = useAnimatedStyle(shade(top));
  const bottomCrease = useAnimatedStyle(crease(bottom));
  const topCrease = useAnimatedStyle(crease(top));

  // Bottom hinges on its top edge and swings toward the viewer; top hinges on its bottom edge.
  // Front and back share one transform. The face is chosen by progress (front before 90 degrees,
  // back after), so it behaves the same on iOS and Android; the front also sets
  // backfaceVisibility hidden as a second guard.
  const hinge = (p: SharedValue<number>, dir: 1 | -1, back: boolean) => () => {
    'worklet';
    const v = p.get();
    const showBack = v >= 0.5;
    return {
      opacity: showBack === back ? 1 : 0,
      transform: [{ perspective: PERSPECTIVE }, { rotateX: `${dir * 180 * v}deg` }],
    };
  };
  const bottomFront = useAnimatedStyle(hinge(bottom, 1, false));
  const bottomBack = useAnimatedStyle(hinge(bottom, 1, true));
  const topFront = useAnimatedStyle(hinge(top, -1, false));
  const topBack = useAnimatedStyle(hinge(top, -1, true));
  const slipStyle = useAnimatedStyle(() => {
    const s = slip.get();
    return { transform: [{ rotate: `${-5 * s}deg` }, { scale: 1 - 0.45 * s }] };
  });

  const origin = (o: 'top' | 'bottom') => ({ transformOrigin: o });
  const panel = (i: number, extra: object) => [styles.panel, { top: i * h, height: h, width }, extra];

  return (
    <Animated.View pointerEvents="none" style={[{ width, height }, styles.stack, slipStyle]}>
      {/* middle: stays flat, then ends up under the two folded thirds */}
      <View style={panel(1, { zIndex: 1 })}>
        <View style={{ marginTop: -h }}>
          <Paper withText />
        </View>
        <Animated.View style={[styles.crease, { top: 0 }, topCrease]} />
        <Animated.View style={[styles.crease, { bottom: 0 }, bottomCrease]} />
      </View>

      <Animated.View style={[panel(2, { zIndex: 2 }), origin('top'), { backfaceVisibility: 'hidden' }, bottomFront]}>
        <View style={{ marginTop: -2 * h }}>
          <Paper withText />
        </View>
        <Animated.View style={[StyleSheet.absoluteFill, styles.shade, bottomShade]} />
      </Animated.View>
      <Animated.View style={[panel(2, { zIndex: 2 }), origin('top'), bottomBack]}>
        <View style={[styles.back, { backgroundColor: paper, borderColor: tint ?? border }]}>
          {tint && <View style={[StyleSheet.absoluteFill, { backgroundColor: tint, opacity: 0.18 }]} />}
        </View>
        <Animated.View style={[StyleSheet.absoluteFill, styles.shade, bottomShade]} />
      </Animated.View>

      <Animated.View style={[panel(0, { zIndex: 3 }), origin('bottom'), { backfaceVisibility: 'hidden' }, topFront]}>
        <Paper withText />
        <Animated.View style={[StyleSheet.absoluteFill, styles.shade, topShade]} />
      </Animated.View>
      <Animated.View style={[panel(0, { zIndex: 3 }), origin('bottom'), topBack]}>
        <View style={[styles.back, { backgroundColor: paper, borderColor: tint ?? border }]}>
          {tint && <View style={[StyleSheet.absoluteFill, { backgroundColor: tint, opacity: 0.18 }]} />}
        </View>
        <Animated.View style={[StyleSheet.absoluteFill, styles.shade, topShade]} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stack: { position: 'absolute', left: 0, top: 0 },
  panel: { position: 'absolute', left: 0, overflow: 'hidden' },
  paper: { borderWidth: 2, borderRadius: RADIUS, overflow: 'hidden' },
  text: { paddingHorizontal: 20, paddingTop: 20 },
  back: { flex: 1, borderWidth: 2, borderRadius: 4, overflow: 'hidden' },
  shade: { backgroundColor: '#000' },
  crease: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#2e2a26',
  },
});
