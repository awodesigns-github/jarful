import { useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Animated,
  scheduleOnRN,
  useAnimatedStyle,
  useSharedValue,
  useReduced,
  withDelay,
  withTiming,
} from '@/motion/primitives';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { countNoteChars, NOTE_MAX, NOTE_RAW_MAX, useAddNote, useDraft, type MoodName } from '@/lib/data';
import { CharCounter } from '@/components/CharCounter';
import { Icon } from '@/components/Icon';
import { useOnline } from '@/components/useOnline';
import { MIN_TARGET, mood, useTheme } from '@/theme';
import { NoteFold } from '@/components/compose/NoteFold';
import { EIO, EO } from '@/motion/curves';
import { creaseHaptic } from '@/motion/haptics';
import { dropCoordinator } from '@/motion/dropCoordinator';

const MOODS = Object.keys(mood) as MoodName[];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export default function Compose() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const online = useOnline();
  const addNote = useAddNote();
  const { text, setText, clear } = useDraft();
  const [colour, setColour] = useState<MoodName | undefined>();
  const reduced = useReduced();
  const fold = useSharedValue(0); // reduced motion only: 0 note, 1 faded
  const foldBottom = useSharedValue(0); // letter fold: bottom third up
  const foldTop = useSharedValue(0); // then top third down
  const foldSlip = useSharedValue(0); // then the slip tilts and shrinks
  const [folding, setFolding] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const onCardLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!folding) setBox({ w: width, h: height });
  };
  const { colors, type, space, radius } = theme;

  const count = countNoteChars(text);
  const canDrop = text.trim().length > 0 && count <= NOTE_MAX;
  const now = new Date();
  const today = `${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}`;

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  // Drop-in, part 1: a letter fold. Bottom third up (180 ms), top third down over it
  // (180 ms, starting 150 ms in), then the slip tilts and shrinks (150 ms) and we leave.
  // Home's transition end/focus triggers the add and the fall (BUG-3, BUG-6).
  const drop = () => {
    if (!canDrop || !dropCoordinator.request({ text, colour })) return;
    if (reduced || box.h <= 0) {
      fold.set(
        withTiming(1, { duration: 180, easing: EO }, (finished) => {
          'worklet';
          if (finished) scheduleOnRN(finishFold);
        }),
      );
      return;
    }
    setFolding(true);
    setTimeout(creaseHaptic, 90);
    setTimeout(creaseHaptic, 240);
    foldBottom.set(withTiming(1, { duration: 180, easing: EIO }));
    foldTop.set(withDelay(150, withTiming(1, { duration: 180, easing: EIO })));
    foldSlip.set(
      withDelay(
        330,
        withTiming(1, { duration: 150, easing: EO }, (finished) => {
          'worklet';
          if (finished) scheduleOnRN(finishFold);
        }),
      ),
    );
  };
  const finishFold = () => {
    if (dropCoordinator.leaving()) leave();
  };

  const foldStyle = useAnimatedStyle(() => (reduced ? { opacity: 1 - fold.get() } : { opacity: folding ? 0 : 1 }));

  const tint = colour ? mood[colour] : undefined;

  return (
    <View
      testID="screen-compose"
      style={[styles.root, { backgroundColor: colors.bgBase, paddingTop: insets.top + space.s12 }]}
    >
      <View style={[styles.header, { paddingHorizontal: space.s24 }]}>
        <Pressable
          testID="compose-close"
          accessibilityRole="button"
          accessibilityLabel="Close, your draft is kept"
          onPress={leave}
          style={[
            styles.round,
            {
              backgroundColor: colors.bgSurface,
              borderColor: colors.borderSubtle,
            },
          ]}
        >
          <Icon name="close" color={colors.textPrimary} />
        </Pressable>
        <Text accessibilityRole="header" style={[type.titleS, { color: colors.textPrimary }]}>
          New note
        </Text>
        <Text style={[type.labelS, styles.date, { color: colors.textSecondary }]}>{today}</Text>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: space.s24,
          paddingTop: space.s20,
          paddingBottom: insets.bottom + space.s24,
          gap: space.s20,
        }}
      >
        <View>
          <Animated.View
            onLayout={onCardLayout}
            style={[
              foldStyle,
              styles.card,
              {
                backgroundColor: colors.bgSurface,
                borderColor: tint ?? colors.borderSubtle,
                borderRadius: 24,
              },
            ]}
          >
            {tint && (
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tint, opacity: 0.18 }]} />
            )}
            <TextInput
              testID="compose-input"
              accessibilityLabel="Write one good thing from today"
              placeholder="What made today a little better?"
              placeholderTextColor={colors.textSecondary}
              value={text}
              onChangeText={setText}
              multiline
              autoFocus
              maxLength={NOTE_RAW_MAX}
              textAlignVertical="top"
              selectionColor={colors.accentMuted}
              style={[type.noteL, styles.input, { color: colors.textPrimary }]}
            />
            <View style={styles.cardFoot}>
              {!online ? (
                <Text
                  testID="compose-offline"
                  accessibilityLiveRegion="polite"
                  style={[type.labelS, { color: colors.textSecondary }]}
                >
                  Saved on this phone
                </Text>
              ) : (
                <View />
              )}
              <CharCounter testID="compose-counter" count={count} />
            </View>
          </Animated.View>
          {folding && box.h > 0 && (
            <NoteFold
              width={box.w}
              height={box.h}
              text={text}
              tint={tint}
              paper={colors.bgSurface}
              border={colors.borderSubtle}
              ink={colors.textPrimary}
              textStyle={type.noteL}
              bottom={foldBottom}
              top={foldTop}
              slip={foldSlip}
            />
          )}
        </View>

        <View style={{ gap: space.s12 }}>
          <Text style={[type.labelS, { color: colors.textSecondary, letterSpacing: 0.4 }]}>MOOD COLOUR · OPTIONAL</Text>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {MOODS.map((name) => {
              const selected = colour === name;
              return (
                <Pressable
                  key={name}
                  testID={`mood-${name}`}
                  accessibilityRole="radio"
                  accessibilityLabel={`${cap(name)}, mood colour`}
                  accessibilityState={{ selected, checked: selected }}
                  hitSlop={2}
                  onPress={() => setColour(selected ? undefined : name)}
                  style={styles.chipSlot}
                >
                  <View style={[styles.chipRing, selected && { borderColor: colors.borderStrong }]}>
                    <View style={[styles.chip, { backgroundColor: mood[name] }]} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[styles.dropShadow, { backgroundColor: colors.accentMuted, opacity: canDrop ? 1 : 0.5 }]}>
          <Pressable
            testID="compose-drop"
            accessibilityRole="button"
            accessibilityLabel="Drop it in"
            accessibilityState={{ disabled: !canDrop }}
            disabled={!canDrop}
            onPress={drop}
            style={({ pressed }) => [
              styles.drop,
              {
                backgroundColor: colors.actionPrimary,
                borderColor: colors.borderStrong,
                borderRadius: radius.pill,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              },
            ]}
          >
            <Text style={[type.labelL, { color: colors.actionOnPrimary }]}>Drop it in</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: MIN_TARGET,
  },
  round: {
    width: MIN_TARGET,
    height: MIN_TARGET,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  date: { minWidth: MIN_TARGET, textAlign: 'right' },
  card: { borderWidth: 2, overflow: 'hidden', minHeight: 200 },
  input: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
    minHeight: 140,
  },
  cardFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  chips: { flexDirection: 'row', justifyContent: 'space-between' },
  // 44 dp visual, hitSlop 2 each side makes 48 dp.
  chipSlot: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: { width: 34, height: 34, borderRadius: 17 },
  dropShadow: { borderRadius: 999, paddingBottom: 4 },
  drop: {
    height: 56,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
});
