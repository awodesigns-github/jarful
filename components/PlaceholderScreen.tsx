import type { ReactNode } from 'react';
import { Link, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MIN_TARGET, useTheme } from '@/theme';

type Props = {
  id: string;
  title: string;
  label: string;
  links?: { href: Href; id: string; text: string }[];
  children?: ReactNode;
};

// Placeholder only. Real screens arrive in M1. Only the home wordmark uses the display face.
export function PlaceholderScreen({ id, title, label, links = [], children }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { colors, type, space } = theme;
  const isHome = id === 'index';
  return (
    <View
      testID={`screen-${id}`}
      accessible={!children}
      accessibilityLabel={label}
      style={[
        styles.root,
        {
          backgroundColor: colors.bgBase,
          paddingTop: insets.top + space.s24,
          paddingBottom: insets.bottom + space.s24,
          paddingLeft: insets.left + space.s24,
          paddingRight: insets.right + space.s24,
          gap: space.s12,
        },
      ]}
    >
      <Text
        accessibilityRole="header"
        style={[isHome ? type.displayL : type.titleL, { color: colors.textPrimary }]}
      >
        {title}
      </Text>
      {links.map((l) => (
        <Link key={l.id} href={l.href} asChild>
          <Pressable
            testID={`link-${l.id}`}
            accessibilityRole="link"
            accessibilityLabel={l.text}
            style={StyleSheet.flatten([styles.link, { paddingHorizontal: space.s16 }])}
          >
            <Text style={[type.labelL, { color: colors.textPrimary }]}>{l.text}</Text>
          </Pressable>
        </Link>
      ))}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  link: { minHeight: MIN_TARGET, minWidth: MIN_TARGET, justifyContent: 'center' },
});
