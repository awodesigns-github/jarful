import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { NOTE_MAX } from '@/lib/data';
import { useTheme } from '@/theme';

const R = 5.5;
const C = 2 * Math.PI * R;

/** Counter states from Figma (Handoff): normal, near limit (120 to 139), at limit (140). Never red. */
export function CharCounter({ count, testID }: { count: number; testID?: string }) {
  const { theme } = useTheme();
  const { colors, type } = theme;
  const near = count >= 120;
  const progress = Math.min(1, count / NOTE_MAX);
  const label =
    count > NOTE_MAX
      ? `${count} of ${NOTE_MAX} characters. Over the limit, trim a little to drop it in`
      : count === NOTE_MAX
        ? `${count} of ${NOTE_MAX} characters. At the limit`
        : near
          ? `${count} of ${NOTE_MAX} characters. Nearly at the limit`
          : `${count} of ${NOTE_MAX} characters`;
  return (
    <View testID={testID} accessible accessibilityRole="text" accessibilityLabel={label} style={styles.row}>
      {near && (
        <Svg width={14} height={14} viewBox="0 0 14 14" accessible={false} importantForAccessibility="no">
          <Circle cx={7} cy={7} r={R} stroke={colors.borderSubtle} strokeWidth={2} fill="none" />
          <Circle
            cx={7}
            cy={7}
            r={R}
            stroke={colors.accentMuted}
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${C * progress} ${C}`}
            transform="rotate(-90 7 7)"
          />
        </Svg>
      )}
      <Text
        style={[
          near ? { ...type.labelS, fontFamily: 'DMSans_700Bold' } : type.labelS,
          { color: near ? colors.textPrimary : colors.textSecondary },
        ]}
      >
        {count} / {NOTE_MAX}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 6 } });
