import React from 'react';
import { Pressable, StyleSheet, Text, View, type PressableProps, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { getColorByTheme } from '@/utils/colors';

export type NativeProductButtonVariant = 'primary' | 'secondary' | 'quiet';

export function NativeProductButton({ label, onPress, variant = 'secondary', disabled = false, selected, accessibilityRole = 'button', style, testID }: {
  label: string;
  onPress: () => void;
  variant?: NativeProductButtonVariant;
  disabled?: boolean;
  selected?: boolean;
  accessibilityRole?: PressableProps['accessibilityRole'];
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { theme, isDark } = useTheme();
  const color = (key: string) => getColorByTheme(theme, isDark, key);
  const primary = variant === 'primary';
  const quiet = variant === 'quiet';
  return <Pressable testID={testID} accessibilityRole={accessibilityRole} accessibilityLabel={label}
    accessibilityState={{ disabled, ...(selected === undefined ? {} : { selected }) }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, {
      backgroundColor: primary ? color('action.accent') : quiet ? color('bg.canvas') : color(selected ? 'bg.raised' : 'bg.surface'),
      borderColor: primary ? color('action.accent') : selected ? color('action.accent') : color('line.hairline'),
      opacity: disabled ? 0.5 : pressed ? 0.78 : 1,
    }, style]}>
    <Text style={{ color: primary ? color('ink.on-accent') : color('ink.primary'),
      fontFamily: theme.typography.fontFamily['ui.medium'], fontSize: theme.typography.fontSize.md, textAlign: 'center', flexShrink: 1 }}>{label}</Text>
  </Pressable>;
}

export function NativeProductHeading({ eyebrow, title, description, trailing, style, testID }: {
  eyebrow?: string;
  title: string;
  description?: string;
  trailing?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { theme, isDark } = useTheme();
  const color = (key: string) => getColorByTheme(theme, isDark, key);
  return <View style={[styles.heading, style]}>
    <View style={styles.grow}>
      {eyebrow ? <Text style={{ color: color('ink.secondary'), fontFamily: theme.typography.fontFamily['ui.medium'], fontSize: theme.typography.fontSize.sm }}>{eyebrow}</Text> : null}
      <Text testID={testID} accessibilityRole="header" style={{ color: color('ink.primary'), fontFamily: theme.typography.fontFamily.display, fontSize: theme.typography.fontSize['2xl'], flexShrink: 1 }}>{title}</Text>
      {description ? <Text style={{ color: color('ink.secondary'), fontFamily: theme.typography.fontFamily.ui, fontSize: theme.typography.fontSize.md }}>{description}</Text> : null}
    </View>
    {trailing}
  </View>;
}

export function NativeProductCard({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { theme, isDark } = useTheme();
  return <View style={[styles.card, { backgroundColor: getColorByTheme(theme, isDark, 'bg.surface'), borderColor: getColorByTheme(theme, isDark, 'line.hairline'), borderRadius: theme.radius.card }, style]}>{children}</View>;
}

export function NativeProductLabel({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const { theme, isDark } = useTheme();
  return <Text style={[{ color: getColorByTheme(theme, isDark, 'ink.secondary'), fontFamily: theme.typography.fontFamily['ui.medium'], fontSize: theme.typography.fontSize.sm }, style]}>{children}</Text>;
}

export function NativeProductBadge({ label }: { label: string }) {
  const { theme, isDark } = useTheme();
  return <View accessibilityLabel={label} style={{ alignSelf: 'flex-start', minHeight: 28, justifyContent: 'center', paddingHorizontal: 10,
    backgroundColor: getColorByTheme(theme, isDark, 'bg.raised'), borderRadius: theme.radius.pill }}>
    <Text style={{ color: getColorByTheme(theme, isDark, 'ink.secondary'), fontFamily: theme.typography.fontFamily['ui.medium'], fontSize: theme.typography.fontSize.xs }}>{label}</Text>
  </View>;
}

const styles = StyleSheet.create({
  button: { minHeight: 48, borderWidth: 1, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1, minWidth: 0, gap: 4 },
  card: { padding: 16, borderWidth: 1, gap: 12 },
});
