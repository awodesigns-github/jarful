import { memo } from 'react';
import Svg, { ClipPath, Defs, G, Path, Rect } from 'react-native-svg';
import { mood, useTheme } from '@/theme';
import { GLASS_PATH, HIGHLIGHT_PATH, NEUTRAL_SLIP, SLIPS } from './slips';

const LINE = '#2e2a26';
const LID = '#c8755a';

/** Capacity the slip layout is drawn for. Slips beyond it (a 31st note) fill the neck. */
export const JAR_CAPACITY = 30;

/** Plain-language fill, for TalkBack. Never a number. */
export function jarFillLabel(fill: number): string {
  if (fill <= 0) return 'Your jar, empty and ready for its first note';
  if (fill < 0.25) return 'Your jar, a little full';
  if (fill < 0.45) return 'Your jar, about a third full';
  if (fill < 0.6) return 'Your jar, about half full';
  if (fill < 0.85) return 'Your jar, more than half full';
  if (fill < 1) return 'Your jar, nearly full';
  return 'Your jar, full';
}

type Props = { fill: number; width?: number; testID?: string; colours?: (string | null)[] };

function slipFill(c: string | null | undefined, fallback: string): string {
  return c && c in mood ? mood[c as keyof typeof mood] : fallback;
}

/**
 * The jar, drawn from jarful-jar/jar-layers.svg. `fill` is a share of capacity (0 to 1+);
 * folded slips stack from the bottom, oldest first. With `colours`, each slip takes its note's mood
 * colour (neutral when the note has none); without it, the artwork's own colours.
 */
export const Jar = memo(function Jar({ fill, width = 260, testID, colours }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const shown = Math.max(0, Math.min(SLIPS.length, Math.round(Math.max(0, fill) * JAR_CAPACITY)));
  const height = (width * 320) / 260;
  return (
    <Svg testID={testID} width={width} height={height} viewBox="0 8 260 320" fill="none">
      <Defs>
        <ClipPath id="jarClip">
          <Path d={GLASS_PATH} transform="translate(0 -5.382)" />
        </ClipPath>
      </Defs>
      <G transform="translate(0 -5.382)">
        <Path d={GLASS_PATH} fill={colors.jarGlass} />
        {shown === 0 && (
          <Rect
            x={72.656}
            y={157.221}
            width={114.5}
            height={76.5}
            rx={14.25}
            transform="rotate(3 72.656 157.221)"
            fill={colors.bgBase}
            stroke={colors.jarLine}
            strokeWidth={3.5}
          />
        )}
      </G>
      <G clipPath="url(#jarClip)">
        <G transform="translate(0 -5.382)">
          {SLIPS.slice(0, shown).map((s, i) => (
            <G key={i}>
              <Rect
                x={s.x}
                y={s.y}
                width={44}
                height={30}
                rx={7}
                transform={`rotate(${s.rot} ${s.x} ${s.y})`}
                fill={colours ? slipFill(colours[i], NEUTRAL_SLIP) : s.fill}
                stroke={LINE}
                strokeWidth={2}
              />
              <Path d={s.fold} stroke={LINE} strokeWidth={1.5} strokeLinecap="round" />
            </G>
          ))}
        </G>
      </G>
      <G transform="translate(0 -5.382)">
        <Path d={GLASS_PATH} stroke={colors.jarLine} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        <Path d={HIGHLIGHT_PATH} stroke="#ffffff" strokeOpacity={0.75} strokeWidth={6} strokeLinecap="round" />
        <Rect x={62} y={57.3816} width={136} height={18} rx={4} fill={colors.jarGlass} stroke={colors.jarLine} strokeWidth={4} />
      </G>
      <Rect x={50} y={14} width={160} height={38} rx={10} fill={LID} stroke={colors.jarLine} strokeWidth={4} />
      {[80, 112, 144, 176].map((x) => (
        <Path key={x} d={`M${x} 24V42`} stroke={colors.jarLine} strokeOpacity={0.35} strokeWidth={2.5} strokeLinecap="round" />
      ))}
    </Svg>
  );
});
