import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { Animated, useAnimatedStyle, withTiming } from '@/motion/primitives';
import { mood, MIN_TARGET, useTheme } from '@/theme';
import { dayMonth } from './format';

export type RowNote = { id: string; text: string; colour: string | null; createdAt: number; pending?: boolean };

type Props = {
  note: RowNote;
  favourite: boolean;
  /** Omit for a read-only row (sealed jar). */
  onToggle?: (id: string, next: boolean) => void;
  /** Fades the row out (an un-hearted note leaving the favourites list). */
  leaving?: boolean;
};

/** One note: mood swatch (never a text colour), date, full text, and a favourite heart. */
export const NoteRow = memo(function NoteRow({ note, favourite, onToggle, leaving = false }: Props) {
  const { theme } = useTheme();
  const { colors, type, space } = theme;
  const swatch = note.colour && note.colour in mood ? mood[note.colour as keyof typeof mood] : colors.borderSubtle;
  const date = dayMonth(note.createdAt);
  const fade = useAnimatedStyle(() => ({ opacity: withTiming(leaving ? 0 : 1, { duration: 160 }) }));
  return (
    <Animated.View
      testID={`archive-row-${note.id}`}
      style={[styles.row, { backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle, gap: space.s12 }, fade]}
    >
      <View
        accessible
        accessibilityLabel={`Note from ${date}${favourite ? ', favourite' : ''}: ${note.text}`}
        style={styles.body}
      >
        <View style={[styles.swatch, { backgroundColor: swatch }]} />
        <View style={styles.texts}>
          <Text style={[type.labelS, { color: colors.textSecondary }]}>{date}</Text>
          <Text style={[type.bodyM, { color: colors.textPrimary }]}>{note.text}</Text>
          {note.pending ? (
            <Text testID={`archive-pending-${note.id}`} style={[type.labelS, { color: colors.textSecondary, marginTop: 2 }]}>
              Saved on this phone
            </Text>
          ) : null}
        </View>
      </View>
      {onToggle && !note.pending ? (
        <Pressable
          testID={`archive-fav-${note.id}`}
          accessibilityRole="button"
          accessibilityLabel={favourite ? `Remove ${date} from favourites` : `Add ${date} to favourites`}
          accessibilityState={{ selected: favourite }}
          onPress={() => onToggle(note.id, !favourite)}
          style={styles.heart}
        >
          <Icon name="heart" size={22} color={favourite ? mood.pink : colors.textSecondary} fill={favourite ? mood.pink : undefined} />
        </Pressable>
      ) : !onToggle && favourite ? (
        <View style={styles.heart} accessible={false} importantForAccessibility="no-hide-descendants">
          <Icon name="heart" size={22} color={mood.pink} fill={mood.pink} />
        </View>
      ) : null}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 18, paddingVertical: 14, paddingLeft: 16, paddingRight: 4, minHeight: 80 },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 },
  swatch: { width: 6, alignSelf: 'stretch', minHeight: 48, borderRadius: 3 },
  texts: { flex: 1, gap: 4 },
  heart: { width: MIN_TARGET, height: MIN_TARGET, alignItems: 'center', justifyContent: 'center' },
});
