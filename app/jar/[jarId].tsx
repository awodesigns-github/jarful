import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useJarNotes, useShelf } from '@/lib/data';
import type { Id } from '@/convex/_generated/dataModel';
import { NoteRow } from '@/components/archive/NoteRow';
import { ScreenHeader } from '@/components/archive/ScreenHeader';
import { jarRange } from '@/components/archive/format';
import { useTheme } from '@/theme';

/** A sealed jar's notes, oldest first, read-only. */
export default function JarNotes() {
  const { jarId } = useLocalSearchParams<{ jarId: string }>();
  const { theme } = useTheme();
  const { colors, type, space } = theme;
  const insets = useSafeAreaInsets();
  const notes = useJarNotes(jarId as Id<'jars'>);
  const jar = useShelf()?.find((j) => j.jarId === jarId);
  const ordered = notes ? [...notes].reverse() : [];
  return (
    <View testID="screen-jar" style={[styles.root, { backgroundColor: colors.bgBase, paddingTop: insets.top + space.s16 }]}>
      <FlatList
        testID="jar-notes-list"
        accessibilityLabel="Notes in this jar"
        data={ordered}
        keyExtractor={(n) => n._id}
        ListHeaderComponent={
          <View style={{ paddingBottom: space.s16 }}>
            <ScreenHeader
              testID="jar"
              title={jar ? jarRange(jar.startedAt, jar.sealedAt) : 'Sealed jar'}
              subtitle={jar ? `${jar.noteCount} notes, sealed and safe` : undefined}
            />
          </View>
        }
        contentContainerStyle={{ paddingHorizontal: space.s24, paddingBottom: insets.bottom + space.s32 }}
        ItemSeparatorComponent={() => <View style={{ height: space.s12 }} />}
        renderItem={({ item }) => (
          <NoteRow note={{ id: item._id, text: item.text, colour: item.colour ?? null, createdAt: item.createdAt }} favourite={!!item.isFavourite} />
        )}
        ListEmptyComponent={notes === undefined ? undefined : <Text style={[type.bodyM, { color: colors.textSecondary }]}>This jar is empty.</Text>}
      />
    </View>
  );
}

export function ErrorBoundary() {
  const { theme } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: theme.colors.bgBase, padding: 24, justifyContent: 'center' }]}>
      <Text style={[theme.type.bodyM, { color: theme.colors.textPrimary, textAlign: 'center' }]}>We could not find that jar.</Text>
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
