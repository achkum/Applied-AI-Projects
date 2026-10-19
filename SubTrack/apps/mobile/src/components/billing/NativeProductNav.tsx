import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { useI18n } from '@/context/I18nContext';
import { getColorByTheme } from '@/utils/colors';
import { BillingIcon } from './BillingIcon';
import {useRouter} from 'expo-router';

export type NativeProductDestination = 'month' | 'upcoming' | 'manage' | 'household' | 'insights' | 'profile';
export const nativeProductRoutes = {month:'/personal-billing-month', upcoming:'/personal-home', manage:'/personal', household:'/personal-household', insights:'/personal-insights', profile:'/personal-profile'} as const;
const destinations: readonly { key: NativeProductDestination; icon: React.ComponentProps<typeof BillingIcon>['name']; label: string }[] = [
  { key: 'month', icon: 'home', label: 'home' },
  { key: 'manage', icon: 'manage', label: 'manage' },
  { key: 'household', icon: 'people', label: 'household' },
  { key: 'insights', icon: 'chart', label: 'insights' },
  { key: 'profile', icon: 'user', label: 'profile' },
];

export function NativeProductNav({ active, onNavigate }: { active: NativeProductDestination; onNavigate?: (destination: NativeProductDestination) => void }) {
  const { t } = useI18n();
  const { theme, isDark } = useTheme();
  const router = useRouter();
  const color = (key: string) => getColorByTheme(theme, isDark, key);
  return <View testID="native-product-navigation" accessibilityRole="tablist" accessibilityLabel={t('onboarding.productNav.label')} style={[styles.bar, { backgroundColor: color('bg.canvas'), borderTopColor: color('line.hairline') }]}>
    {destinations.map(item => {
      const selected = active === item.key || active === 'upcoming' && item.key === 'month';
      const label = t(`onboarding.productNav.${item.label}`);
      return <Pressable key={item.key} testID={`native-nav-${item.key}`} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected }} onPress={() => {if(onNavigate)onNavigate(item.key);else router.replace(nativeProductRoutes[item.key]);}} style={styles.tab}>
        <BillingIcon name={item.icon} color={color(selected ? 'action.accent' : 'ink.secondary')} size={22} />
        <Text style={{ color: color(selected ? 'action.accent' : 'ink.secondary'), fontFamily: theme.typography.fontFamily['ui.medium'], fontSize: theme.typography.fontSize.nav, textAlign: 'center' }}>{label}</Text>
      </Pressable>;
    })}
  </View>;
}

const styles = StyleSheet.create({ bar: { minHeight: 64, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 4, paddingTop: 6, paddingBottom: 10 }, tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 0 } });
