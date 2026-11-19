import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings, useUpdateSettings, type ReducedMotionSetting, type ThemeMode } from '@/lib/data';
import { Icon } from '@/components/Icon';
import { cancelReminder, enableReminder, hasPermission, formatTime, parseTime, rescheduleReminder } from '@/components/settings/reminder';
import { MIN_TARGET, radius, space, useTheme } from '@/theme';

const DEFAULT_TIME = '21:00';
const THEMES: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];
const MOTION: { value: ReducedMotionSetting; label: string }[] = [
  { value: 'system', label: 'Follow system' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

export default function Settings() {
  const { theme } = useTheme();
  const { colors, type } = theme;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const settings = useSettings();
  const update = useUpdateSettings();
  const [denied, setDenied] = useState(false);
  const [picking, setPicking] = useState(false);
  const on = settings.reminderTime !== null;

  // Permission can be switched off in system settings; say so calmly instead of showing a dead reminder.
  useEffect(() => {
    if (!on) return;
    let alive = true;
    void hasPermission().then((ok) => alive && setDenied(!ok)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [on]);

  const toggleReminder = async (next: boolean) => {
    if (!next) {
      setDenied(false);
      setPicking(false);
      await update({ reminderTime: null });
      await cancelReminder().catch(() => {});
      return;
    }
    const result = await enableReminder(settings.reminderTime ?? DEFAULT_TIME).catch(() => 'denied' as const);
    if (result === 'granted') {
      setDenied(false);
      await update({ reminderTime: settings.reminderTime ?? DEFAULT_TIME });
    } else {
      setDenied(true);
    }
  };

  const setTime = async (hour: number, minute: number) => {
    const t = formatTime(hour, minute);
    await update({ reminderTime: t });
    await rescheduleReminder(t).catch(() => {});
  };

  const card = [styles.card, { backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle }];
  const label = [type.bodyL, { color: colors.textPrimary }];
  const time = settings.reminderTime ? parseTime(settings.reminderTime) : null;

  return (
    <ScrollView
      testID="screen-settings"
      style={{ backgroundColor: colors.bgBase }}
      contentContainerStyle={{ paddingTop: insets.top + space.s12, paddingBottom: insets.bottom + space.s32, paddingHorizontal: space.s24, gap: space.s16 }}
    >
      <Pressable
        testID="settings-back"
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        style={[styles.back, { backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle }]}
      >
        <Icon name="chevronLeft" size={24} color={colors.textPrimary} />
      </Pressable>
      <Text accessibilityRole="header" style={[type.titleL, { color: colors.textPrimary }]}>
        Settings
      </Text>

      <View style={card}>
        <ToggleRow
          id="reminder"
          label="Daily reminder"
          value={on}
          onChange={toggleReminder}
          textStyle={label}
          colors={colors}
        />
        {denied && (
          <View testID="reminder-denied" style={styles.note}>
            <Text style={[type.bodyS, { color: colors.textSecondary }]}>
              Notifications are off for Jarful, so there is no reminder yet. You can allow them whenever you like.
            </Text>
            <Pressable
              testID="reminder-open-settings"
              accessibilityRole="button"
              accessibilityLabel="Open system settings"
              onPress={() => void Linking.openSettings()}
              style={styles.linkBtn}
            >
              <Text style={[type.labelL, { color: colors.textPrimary }]}>Open settings</Text>
            </Pressable>
          </View>
        )}
        {on && time && (
          <>
            <Pressable
              testID="reminder-time-row"
              accessibilityRole="button"
              accessibilityLabel={`Reminder time, ${settings.reminderTime}`}
              accessibilityState={{ expanded: picking }}
              onPress={() => setPicking((p) => !p)}
              style={[styles.row, { borderColor: colors.borderSubtle }]}
            >
              <Text style={[label, styles.grow]}>Reminder time</Text>
              <Text style={[type.bodyM, { color: colors.textSecondary }]}>{settings.reminderTime}</Text>
              <Icon name="chevronRight" size={20} color={colors.textSecondary} />
            </Pressable>
            {picking && (
              <View style={styles.picker}>
                <Stepper id="hour" name="Hour" value={time.hour} max={23} step={1} onChange={(h) => void setTime(h, time.minute)} colors={colors} type={type} />
                <Text style={[type.titleM, { color: colors.textPrimary }]}>:</Text>
                <Stepper id="minute" name="Minute" value={time.minute} max={59} step={5} onChange={(m) => void setTime(time.hour, m)} colors={colors} type={type} />
              </View>
            )}
          </>
        )}
        <Segmented id="theme" title="Theme" options={THEMES} value={settings.theme} onChange={(v) => void update({ theme: v })} colors={colors} type={type} />
        <Segmented id="motion" title="Reduced motion" options={MOTION} value={settings.reducedMotion} onChange={(v) => void update({ reducedMotion: v })} colors={colors} type={type} />
        <ToggleRow id="haptics" label="Haptics" value={settings.haptics} onChange={(v) => void update({ haptics: v })} textStyle={label} colors={colors} last />
      </View>

      <View style={card}>
        <Pressable
          testID="row-account"
          accessibilityRole="button"
          accessibilityLabel="Account, anonymous"
          onPress={() => router.push('/account' as Href)}
          style={styles.rowLast}
        >
          <Text style={[label, styles.grow]}>Account</Text>
          <Text style={[type.bodyM, { color: colors.textSecondary }]}>Anonymous</Text>
          <Icon name="chevronRight" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>
      <Text style={[type.bodyS, styles.footer, { color: colors.textSecondary }]}>
        Jarful keeps your notes on this phone. Signing in to back up is optional.
      </Text>
    </ScrollView>
  );
}

type Colors = ReturnType<typeof useTheme>['theme']['colors'];
type Type = ReturnType<typeof useTheme>['theme']['type'];

function ToggleRow({ id, label, value, onChange, textStyle, colors, last }: { id: string; label: string; value: boolean; onChange: (v: boolean) => void; textStyle: object; colors: Colors; last?: boolean }) {
  return (
    <Pressable
      testID={`toggle-${id}`}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={last ? styles.rowLast : [styles.row, { borderColor: colors.borderSubtle }]}
    >
      <Text style={[textStyle, styles.grow]}>{label}</Text>
      <View pointerEvents="none" importantForAccessibility="no-hide-descendants">
        <Switch value={value} trackColor={{ false: colors.borderSubtle, true: colors.actionPrimary }} thumbColor={colors.bgSurface} />
      </View>
    </Pressable>
  );
}

function Segmented<T extends string>({ id, title, options, value, onChange, colors, type }: { id: string; title: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; colors: Colors; type: Type }) {
  return (
    <View style={[styles.seg, { borderColor: colors.borderSubtle }]} accessibilityRole="radiogroup" accessibilityLabel={title}>
      <Text style={[type.bodyL, { color: colors.textPrimary }]}>{title}</Text>
      <View style={[styles.segTrack, { backgroundColor: colors.bgSunken }]}>
        {options.map((o) => {
          const sel = o.value === value;
          return (
            <Pressable
              key={o.value}
              testID={`${id}-${o.value}`}
              accessibilityRole="radio"
              accessibilityLabel={`${title}, ${o.label}`}
              accessibilityState={{ selected: sel }}
              onPress={() => onChange(o.value)}
              style={[styles.segItem, sel && { backgroundColor: colors.actionPrimary }]}
            >
              <Text style={[type.labelM, { color: sel ? colors.actionOnPrimary : colors.textPrimary }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Stepper({ id, name, value, max, step, onChange, colors, type }: { id: string; name: string; value: number; max: number; step: number; onChange: (v: number) => void; colors: Colors; type: Type }) {
  const up = () => onChange(value + step > max ? 0 : value + step);
  const down = () => onChange(value - step < 0 ? max - (max % step) : value - step);
  const btn = [styles.stepBtn, { backgroundColor: colors.bgSunken }];
  return (
    <View style={styles.stepper}>
      <Pressable testID={`${id}-up`} accessibilityRole="button" accessibilityLabel={`Later ${name.toLowerCase()}`} onPress={up} style={btn}>
        <Text style={[type.titleM, { color: colors.textPrimary }]}>+</Text>
      </Pressable>
      <Text testID={`${id}-value`} accessibilityLabel={`${name} ${value}`} style={[type.titleL, { color: colors.textPrimary }]}>
        {String(value).padStart(2, '0')}
      </Text>
      <Pressable testID={`${id}-down`} accessibilityRole="button" accessibilityLabel={`Earlier ${name.toLowerCase()}`} onPress={down} style={btn}>
        <Text style={[type.titleM, { color: colors.textPrimary }]}>−</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { width: MIN_TARGET, height: MIN_TARGET, borderRadius: 24, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: space.s16, overflow: 'hidden' },
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: space.s8, borderBottomWidth: 1 },
  rowLast: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: space.s8 },
  grow: { flex: 1 },
  note: { paddingBottom: space.s12, gap: space.s4 },
  linkBtn: { minHeight: MIN_TARGET, justifyContent: 'center', alignSelf: 'flex-start' },
  picker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.s24, paddingVertical: space.s12 },
  stepper: { alignItems: 'center', gap: space.s8 },
  stepBtn: { width: MIN_TARGET, height: MIN_TARGET, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  seg: { paddingVertical: space.s12, gap: space.s8, borderBottomWidth: 1 },
  segTrack: { flexDirection: 'row', borderRadius: radius.sm, padding: 3 },
  segItem: { flex: 1, minHeight: MIN_TARGET - 6, borderRadius: radius.sm - 3, alignItems: 'center', justifyContent: 'center' },
  footer: { textAlign: 'center', paddingHorizontal: space.s16 },
});
