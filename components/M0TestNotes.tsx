// TEMPORARY (M0 only): proves the app talks to Convex end to end. Remove in M2,
// together with lib/data/testNotes.ts and convex/testNotes.ts.
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSaveTestNote, useTestNotes } from '@/lib/data';
import { MIN_TARGET, useTheme } from '@/theme';

export function M0TestNotes() {
  const { theme } = useTheme();
  const { colors, type, space, radius } = theme;
  const notes = useTestNotes();
  const save = useSaveTestNote();
  const [text, setText] = useState('');
  const [problem, setProblem] = useState(false);
  const canSave = text.trim().length > 0;

  const onSave = async () => {
    if (!canSave) return;
    const draft = text;
    setText('');
    setProblem(false);
    try {
      await save({ text: draft });
    } catch {
      setText(draft); // never lose the draft
      setProblem(true);
    }
  };

  return (
    <View testID="m0-test-notes" style={[styles.root, { gap: space.s12 }]}>
      <Text style={[type.labelS, { color: colors.textSecondary }]}>Test note (temporary)</Text>
      <TextInput
        testID="m0-note-input"
        accessibilityLabel="Test note text"
        value={text}
        onChangeText={setText}
        maxLength={140}
        placeholder="Something good today"
        placeholderTextColor={colors.textSecondary}
        style={[
          type.bodyM,
          styles.input,
          { color: colors.textPrimary, backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle, borderRadius: radius.sm, paddingHorizontal: space.s16 },
        ]}
      />
      <Pressable
        testID="m0-save-note"
        accessibilityRole="button"
        accessibilityLabel="Save test note"
        accessibilityState={{ disabled: !canSave }}
        disabled={!canSave}
        onPress={onSave}
        style={[styles.button, { backgroundColor: colors.actionPrimary, borderRadius: radius.pill, opacity: canSave ? 1 : 0.5 }]}
      >
        <Text style={[type.labelL, { color: colors.actionOnPrimary }]}>Save test note</Text>
      </Pressable>
      {problem ? (
        <Text testID="m0-save-problem" style={[type.bodyS, { color: colors.textSecondary }]}>
          That did not save yet. Your words are still here, so try again in a moment.
        </Text>
      ) : null}
      <FlatList
        testID="m0-note-list"
        data={notes ?? []}
        keyExtractor={(n) => n._id}
        style={styles.list}
        ListEmptyComponent={
          <Text style={[type.bodyS, { color: colors.textSecondary }]}>{notes === undefined ? 'Loading...' : 'No test notes yet.'}</Text>
        }
        renderItem={({ item }) => (
          <Text testID={`m0-note-${item._id}`} style={[type.bodyM, { color: colors.textPrimary, paddingVertical: space.s8 }]}>
            {item.text}
          </Text>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%', maxWidth: 420, flexShrink: 1 },
  input: { minHeight: MIN_TARGET, borderWidth: 1 },
  button: { minHeight: MIN_TARGET, alignItems: 'center', justifyContent: 'center' },
  list: { maxHeight: 220 },
});
