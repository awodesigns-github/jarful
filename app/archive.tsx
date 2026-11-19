import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useArchive, useSetFavourite } from '@/lib/data';
import { NoteRow } from '@/components/archive/NoteRow';
import { ScreenHeader } from '@/components/archive/ScreenHeader';
import { monthTitle } from '@/components/archive/format';
import { mood, MIN_TARGET, useTheme } from '@/theme';

type Filter = 'all' | 'favourites';
const LEAVE_MS = 180;

export default function Archive() {
  const { theme } = useTheme();
  const { colors, type, space } = theme;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const favouritesOnly = filter === 'favourites';
  const { months, status, loadMore } = useArchive({ favouritesOnly });
  const setFavourite = useSetFavourite();

  // Optimistic hearts: local overrides until the server agrees; reverted if the write is rejected.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [leaving, setLeaving] = useState<Record<string, true>>({});
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    // Drop overrides the server has caught up with.
    const server = new Map<string, boolean>();
    for (const m of months) for (const n of m.notes) server.set(n._id, n.isFavourite);
    setOverrides((cur) => {
      const next: Record<string, boolean> = {};
      let changed = false;
      for (const [id, v] of Object.entries(cur)) {
        if (server.get(id) === v) changed = true;
        else next[id] = v;
      }
      return changed ? next : cur;
    });
  }, [months]);

  const onToggle = useCallback(
    (id: string, next: boolean) => {
      setOverrides((o) => ({ ...o, [id]: next }));
      if (!next && favouritesOnly) {
        setLeaving((l) => ({ ...l, [id]: true }));
        timers.current.push(
          setTimeout(() => {
            setLeaving((l) => {
              const { [id]: _gone, ...rest } = l;
              return rest;
            });
          }, LEAVE_MS),
        );
      }
      Promise.resolve(setFavourite(id as never, next)).catch(() => {
        setOverrides((o) => {
          const { [id]: _undo, ...rest } = o;
          return rest;
        });
        setLeaving((l) => {
          const { [id]: _undo, ...rest } = l;
          return rest;
        });
      });
    },
    [favouritesOnly, setFavourite],
  );

  const sections = useMemo(
    () =>
      months
        .map((m) => ({
          key: m.key,
          title: monthTitle(m.year, m.month),
          data: m.notes.filter((n) => !(favouritesOnly && overrides[n._id] === false && !leaving[n._id])),
        }))
        .filter((s) => s.data.length > 0),
    [months, favouritesOnly, overrides, leaving],
  );

  const loading = status === 'LoadingFirstPage';
  const empty = !loading && sections.length === 0;

  const chip = (id: Filter, label: string) => {
    const selected = filter === id;
    return (
      <Pressable
        key={id}
        testID={`archive-filter-${id}`}
        accessibilityRole="button"
        accessibilityLabel={id === 'all' ? 'All notes' : 'Favourite notes'}
        accessibilityState={{ selected }}
        onPress={() => setFilter(id)}
        style={[styles.chip, { backgroundColor: selected ? colors.actionPrimary : colors.bgSurface, borderColor: colors.borderSubtle }]}
      >
        <Text style={[type.labelM, { color: selected ? colors.actionOnPrimary : colors.textPrimary }]}>{label}</Text>
      </Pressable>
    );
  };

  const header = (
    <View style={{ gap: space.s16, paddingBottom: space.s16 }}>
      <ScreenHeader
        testID="archive"
        title="Archive"
        right={
          <Pressable
            testID="archive-shelf-link"
            accessibilityRole="link"
            accessibilityLabel="Your jars, the shelf of sealed jars"
            onPress={() => router.push('/shelf')}
            style={[styles.shelf, { backgroundColor: colors.bgSunken, borderColor: colors.borderStrong }]}
          >
            <Text style={[type.labelM, { color: colors.textPrimary }]}>Your jars</Text>
          </Pressable>
        }
      />
      <View style={styles.chips}>
        {chip('all', 'All')}
        {chip('favourites', 'Favourites')}
      </View>
    </View>
  );

  return (
    <View testID="screen-archive" style={[styles.root, { backgroundColor: colors.bgBase, paddingTop: insets.top + space.s16 }]}>
      <SectionList
        testID="archive-list"
        accessibilityLabel="Archive of notes"
        sections={sections}
        keyExtractor={(n) => n._id}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingHorizontal: space.s24, paddingBottom: insets.bottom + space.s32, flexGrow: 1 }}
        ItemSeparatorComponent={() => <View style={{ height: space.s12 }} />}
        renderSectionHeader={({ section }) => (
          <Text accessibilityRole="header" style={[type.titleS, styles.month, { color: colors.textPrimary }]}>
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => (
          <NoteRow
            note={{ id: item._id, text: item.text, colour: item.colour, createdAt: item.createdAt, pending: item.pending }}
            favourite={overrides[item._id] ?? item.isFavourite}
            onToggle={onToggle}
            leaving={!!leaving[item._id]}
          />
        )}
        onEndReached={() => {
          if (status === 'CanLoadMore') loadMore();
        }}
        onEndReachedThreshold={0.6}
        ListEmptyComponent={empty ? <EmptyState favourites={favouritesOnly} onAdd={() => router.push("/compose")} /> : undefined}
      />
    </View>
  );
}

function EmptyState({ favourites, onAdd }: { favourites: boolean; onAdd: () => void }) {
  const { theme } = useTheme();
  const { colors, type, space } = theme;
  return (
    <View testID={favourites ? 'archive-empty-favourites' : 'archive-empty'} style={[styles.empty, { gap: space.s16 }]}>
      <View style={styles.slips} accessible={false} importantForAccessibility="no-hide-descendants">
        {[mood.pink, mood.blue, mood.yellow].map((c, i) => (
          <View key={c} style={[styles.slip, { backgroundColor: c, borderColor: colors.borderStrong, marginLeft: i === 0 ? 0 : -8 }]} />
        ))}
      </View>
      <Text accessibilityRole="header" style={[type.titleM, { color: colors.textPrimary, textAlign: 'center' }]}>
        {favourites ? 'No favourites yet' : 'Your jar is ready'}
      </Text>
      <Text style={[type.bodyM, { color: colors.textSecondary, textAlign: 'center', maxWidth: 260 }]}>
        {favourites ? 'Tap the heart on a memory and it will wait for you here.' : 'Whenever you like, write a first note and it will gather here.'}
      </Text>
      {!favourites ? (
        <Pressable
          testID="archive-empty-add"
          accessibilityRole="button"
          accessibilityLabel="Add a note"
          onPress={onAdd}
          style={[styles.add, { backgroundColor: colors.actionPrimary }]}
        >
          <Text style={[type.labelM, { color: colors.actionOnPrimary }]}>Add a note</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  chips: { flexDirection: 'row', gap: 10 },
  chip: { height: MIN_TARGET, paddingHorizontal: 20, borderRadius: 999, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  shelf: { minHeight: MIN_TARGET, paddingHorizontal: 18, borderRadius: 999, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  month: { marginTop: 12, marginBottom: 10 },
  empty: { alignItems: 'center', paddingTop: 64 },
  slips: { flexDirection: 'row' },
  slip: { width: 64, height: 44, borderRadius: 8, borderWidth: 2 },
  add: { minHeight: MIN_TARGET, paddingHorizontal: 24, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
