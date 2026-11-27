import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShelf } from '@/lib/data';
import { Jar } from '@/components/jar/Jar';
import { ScreenHeader } from '@/components/archive/ScreenHeader';
import { jarRange } from '@/components/archive/format';
import { useTheme } from '@/theme';

export default function Shelf() {
  const { theme } = useTheme();
  const { colors, type, space } = theme;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const jars = useShelf();

  return (
    <View testID="screen-shelf" style={[styles.root, { backgroundColor: colors.bgBase, paddingTop: insets.top + space.s16 }]}>
      <FlatList
        testID="shelf-list"
        accessibilityLabel="Your sealed jars"
        data={jars ?? []}
        keyExtractor={(j) => j.jarId}
        ListHeaderComponent={
          <View style={{ paddingBottom: space.s16 }}>
            <ScreenHeader testID="shelf" title="Your jars" />
          </View>
        }
        contentContainerStyle={{ paddingHorizontal: space.s24, paddingBottom: insets.bottom + space.s32, flexGrow: 1 }}
        ItemSeparatorComponent={() => <View style={{ height: space.s12 }} />}
        renderItem={({ item }) => {
          const range = jarRange(item.startedAt, item.sealedAt);
          return (
            <Pressable
              testID={`shelf-jar-${item.jarId}`}
              accessibilityRole="button"
              accessibilityLabel={`Jar from ${range}, ${item.noteCount} notes`}
              onPress={() => router.push({ pathname: '/jar/[jarId]', params: { jarId: item.jarId } })}
              style={[styles.card, { backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle, gap: space.s16 }]}
            >
              <Jar width={64} face={false} fill={item.capacity > 0 ? item.noteCount / item.capacity : 0} colours={item.colours} />
              <View style={styles.texts}>
                <Text style={[type.titleS, { color: colors.textPrimary }]}>{range}</Text>
                <Text style={[type.bodyS, { color: colors.textPrimary }]}>{item.noteCount} notes</Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          jars === undefined ? undefined : (
            <View testID="shelf-empty" style={[styles.empty, { gap: space.s16 }]}>
              <Jar width={120} fill={0} face={false} />
              <Text accessibilityRole="header" style={[type.titleM, { color: colors.textPrimary, textAlign: 'center' }]}>
                Your shelf is waiting
              </Text>
              <Text style={[type.bodyM, { color: colors.textSecondary, textAlign: 'center', maxWidth: 280 }]}>
                Your first jar seals when it holds 30 notes, and it will rest here. No rush at all.
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  card: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 20, padding: 16, minHeight: 96 },
  texts: { flex: 1, gap: 4 },
  empty: { alignItems: 'center', paddingTop: 40 },
});
