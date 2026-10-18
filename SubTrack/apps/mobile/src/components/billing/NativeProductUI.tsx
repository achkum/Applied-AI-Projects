import React from 'react';
import { Pressable, StyleSheet, Text, View, type PressableProps, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { getColorByTheme } from '@/utils/colors';

export type NativeProductButtonVariant = 'primary' | 'secondary' | 'quiet';

export function NativeProductButton({ label, onPress, variant = 'secondary', disabled = false, selected, accessibilityRole = 'button', style, testID, compact=false }: {
  label: string;
  onPress: () => void;
  variant?: NativeProductButtonVariant;
  disabled?: boolean;
  selected?: boolean;
  accessibilityRole?: PressableProps['accessibilityRole'];
  style?: StyleProp<ViewStyle>;
  testID?: string;
  compact?: boolean;
}) {
  const { theme, isDark } = useTheme();
  const color = (key: string) => getColorByTheme(theme, isDark, key);
  const primary = variant === 'primary';
  const quiet = variant === 'quiet';
  return <Pressable testID={testID} accessibilityRole={accessibilityRole} accessibilityLabel={label}
    accessibilityState={{ disabled, ...(selected === undefined ? {} : { selected }) }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, {
      backgroundColor: primary ? color('action.accent') : quiet ? color(selected===undefined?'bg.canvas':selected?'bg.surface':'bg.raised') : color(selected ? 'bg.raised' : 'bg.surface'),
      borderColor: primary ? color('action.accent') : selected ? color('action.accent') : color('line.hairline'),
      opacity: disabled ? 0.5 : pressed ? 0.78 : 1,
    }, compact&&styles.compactButton, style]}>
    <Text style={{ color: primary ? color('ink.on-accent') : color('ink.primary'),
      fontFamily: theme.typography.fontFamily['ui.semibold'], fontSize: theme.typography.fontSize[compact?'sm':'control'], textAlign: 'center', flexShrink: 1 }}>{label}</Text>
  </Pressable>;
}

export function NativeProductHeading({ eyebrow, title, description, trailing, style, testID, level='page' }: {
  eyebrow?: string | undefined;
  title: string;
  description?: string;
  trailing?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  level?: 'page'|'section';
}) {
  const { theme, isDark } = useTheme();
  const color = (key: string) => getColorByTheme(theme, isDark, key);
  const section=level==='section',size=theme.typography.fontSize[section?'lg':'2xl']!;
  return <View style={[styles.heading,section&&styles.section,style]}>
    <View style={styles.grow}>
      {eyebrow ? <Text style={{ color: color('ink.secondary'), fontFamily: theme.typography.fontFamily['ui.medium'], fontSize: theme.typography.fontSize.sm }}>{eyebrow}</Text> : null}
      <Text testID={testID} accessibilityRole="header" style={{ color: color('ink.primary'), fontFamily: theme.typography.fontFamily.display, fontSize:size,lineHeight:size*(section?1.2:1.12),letterSpacing:size*(section?-.01:-.02),flexShrink: 1 }}>{title}</Text>
      {description ? <Text style={{ color: color('ink.secondary'), fontFamily: theme.typography.fontFamily.ui, fontSize: theme.typography.fontSize.md }}>{description}</Text> : null}
    </View>
    {trailing}
  </View>;
}

export function NativeProductCard({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { theme, isDark } = useTheme();
  return <View style={[styles.card, { backgroundColor: getColorByTheme(theme, isDark, 'bg.surface'), borderRadius: theme.radius.card }, style]}>{children}</View>;
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
  button: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8 },
  compactButton:{alignSelf:'flex-start',paddingHorizontal:12,paddingVertical:8},
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  section:{marginTop:12,marginBottom:-4},
  grow: { flex: 1, minWidth: 0, gap: 4 },
  card: { padding: 16, gap: 12 },
});
