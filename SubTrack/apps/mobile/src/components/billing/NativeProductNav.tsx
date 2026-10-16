import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { useI18n } from '@/context/I18nContext';
import { getColorByTheme } from '@/utils/colors';
import { BillingIcon } from './BillingIcon';

export type NativeProductDestination = 'month' | 'upcoming' | 'manage';
const destinations: readonly { key: NativeProductDestination; icon: React.ComponentProps<typeof BillingIcon>['name']; label: string }[] = [
  { key: 'month', icon: 'calendar', label: 'month' },
  { key: 'upcoming', icon: 'next', label: 'upcoming' },
  { key: 'manage', icon: 'manage', label: 'manage' },
];

export function NativeProductNav({ active, onNavigate }: { active: NativeProductDestination; onNavigate: (destination: NativeProductDestination) => void }) {
  const { t } = useI18n();
  const { theme, isDark } = useTheme();
  const color = (key: string) => getColorByTheme(theme, isDark, key);
  return <View testID="native-product-navigation" accessibilityRole="tablist" accessibilityLabel={t('onboarding.productNav.label')} style={[styles.bar, { backgroundColor: color('bg.surface'), borderTopColor: color('line.hairline') }]}>
    {destinations.map(item => {
      const selected = active === item.key;
      const label = t(`onboarding.productNav.${item.label}`);
      return <Pressable key={item.key} testID={`native-nav-${item.key}`} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected }} onPress={() => onNavigate(item.key)} style={styles.tab}>
        <BillingIcon name={item.icon} color={color(selected ? 'action.accent' : 'ink.secondary')} size={22} />
        <Text style={{ color: color(selected ? 'action.accent' : 'ink.secondary'), fontFamily: theme.typography.fontFamily['ui.medium'], fontSize: theme.typography.fontSize.xs, textAlign: 'center' }}>{label}</Text>
      </Pressable>;
    })}
  </View>;
}

const styles = StyleSheet.create({ bar: { minHeight: 64, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 12, paddingTop: 6, paddingBottom: 6 }, tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 4 } });
