import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Polyline, Line } from 'react-native-svg';
import { useTheme } from '@/context/ThemeContext';
import { useI18n } from '@/context/I18nContext';
import { getColorByTheme } from '@/utils/colors';
import { formatMinorUnits } from '@/api/privateMobileMoney';
import type { Money } from '../../../../../packages/money/src/money';
import { chartPercent } from '../../../../../packages/money/src/recurring-cost';
import type { AnalyticsTrendMonth } from '@/api/nativeAnalyticsProjection';

export function AnalyticsText({ children, kind = 'body' }: { children: React.ReactNode; kind?: 'body' | 'muted' | 'title' | 'amount' | 'hero' }) {
  const { theme, isDark } = useTheme();
  return <Text {...(kind === 'hero' ? { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.4, allowFontScaling: true } : {})} style={{ color: getColorByTheme(theme, isDark, kind === 'muted' ? 'ink.secondary' : 'ink.primary'),
    fontFamily: theme.typography.fontFamily[kind === 'hero' ? 'display.extraBold' : kind === 'amount' ? 'display' : kind === 'title' ? 'ui.medium' : 'ui'],
    fontSize: theme.typography.fontSize[kind === 'hero' ? typeof children === 'string' && children.length > 18 ? '2xl' : 'total' : kind === 'amount' ? '2xl' : kind === 'muted' ? 'sm' : 'md'],
    ...(kind === 'hero' ? { textAlign: 'left' as const, fontVariant: ['tabular-nums' as const], alignSelf: 'stretch' as const, minWidth: 0 } : {}) }}>{children}</Text>;
}
export function AnalyticsMoney({ value, kind = 'amount', heroPeriod }: { value: Money; kind?: 'body' | 'muted' | 'title' | 'amount' | 'hero'; heroPeriod?: string }) {
  const { locale } = useI18n();
  const formatted = formatMinorUnits(value.minorUnits, value.currency, { locale, display: 'code' });
  if (kind === 'hero') {
    // Presentation only: preserve the exact bigint-formatted digits and locale separators.
    const numeric = formatted.endsWith(value.currency) ? formatted.slice(0, -value.currency.length).trimEnd() : formatted.startsWith(value.currency) ? formatted.slice(value.currency.length).trimStart() : formatted;
    return <View accessible accessibilityLabel={formatted} accessibilityHint={heroPeriod} style={{ width: '100%', flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}><View style={{ flexShrink: 1, minWidth: 0 }}><AnalyticsText kind="hero">{numeric}</AnalyticsText></View><View style={{ paddingBottom: 6, maxWidth: '40%' }}><AnalyticsText kind="muted">{heroPeriod ? `${value.currency} ${heroPeriod}` : value.currency}</AnalyticsText></View></View>;
  }
  return <AnalyticsText kind={kind}>{formatted}</AnalyticsText>;
}
/** Reference-style text action, retaining the native 44-point touch target. */
export function AnalyticsLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { theme, isDark } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.link}>
    <Text style={{ color: getColorByTheme(theme, isDark, 'action.accent'), fontFamily: theme.typography.fontFamily['ui.medium'], fontSize: theme.typography.fontSize.sm }}>{label}</Text>
  </Pressable>;
}
export function AnalyticsPriceBox({ children }: { children: React.ReactNode }) {
  const { theme, isDark } = useTheme();
  return <View style={[styles.priceBox, { borderRadius: theme.radius.card, backgroundColor: getColorByTheme(theme, isDark, 'bg.raised') }]}>{children}</View>;
}
export function AnalyticsRing({ count, label }: { count: number; label: string }) {
  const { theme, isDark } = useTheme();
  return <View accessible accessibilityLabel={label} style={styles.ring}>
    <Svg width={76} height={76} viewBox="0 0 76 76" accessible={false}>
      <Circle cx={38} cy={38} r={32} stroke={getColorByTheme(theme, isDark, 'line.hairline')} strokeWidth={5} fill="none" />
      <Circle cx={38} cy={38} r={32} stroke={getColorByTheme(theme, isDark, 'action.accent')} strokeWidth={5} fill="none" />
    </Svg>
    <View style={styles.ringLabel}><AnalyticsText kind="amount">{count}</AnalyticsText></View>
  </View>;
}
export function AnalyticsBar({ value, maximum }: { value: Money; maximum: Money }) {
  const { theme, isDark } = useTheme();
  const percentage = chartPercent(value, maximum);
  return <View accessible={false} style={[styles.track, { backgroundColor: getColorByTheme(theme, isDark, 'bg.raised') }]}>
    <View style={{ width: `${percentage}%`, height: 8, borderRadius: theme.radius.pill, backgroundColor: getColorByTheme(theme, isDark, 'action.accent') }} />
  </View>;
}

/** SVG is decorative; every original exact value is available in the adjacent text rows. */
export function AnalyticsTrend({ months }: { months: readonly AnalyticsTrendMonth[] }) {
  const { theme, isDark } = useTheme(), { t, locale } = useI18n();
  const maximum = months.reduce((largest, row) => row.amount.minorUnits > largest.minorUnits ? row.amount : largest, months[0]!.amount);
  const color = getColorByTheme(theme, isDark, 'action.accent');
  const points = months.map((row, index) => `${12 + index * 58},${116 - chartPercent(row.amount, maximum)}`).join(' ');
  return <View style={styles.trend}>
    <Svg height={136} width="100%" viewBox="0 0 320 136" accessible={false}>
      {[16, 66, 116].map(y => <Line key={y} x1={12} x2={302} y1={y} y2={y} stroke={getColorByTheme(theme, isDark, 'line.hairline')} />)}
      <Polyline points={points} fill="none" stroke={color} strokeWidth={3} strokeLinejoin="round" />
      {months.map((row, index) => <Circle key={row.month} cx={12 + index * 58} cy={116 - chartPercent(row.amount, maximum)} r={4} fill={color} />)}
    </Svg>
    {months.map(row => <View key={row.month} style={styles.row} accessible accessibilityLabel={`${row.month}, ${formatMinorUnits(row.amount.minorUnits, row.amount.currency, { locale, display: 'code' })}, ${t('nativeAnalytics.charges', { count: row.chargeCount })}`}>
      <AnalyticsText kind="muted">{row.month}</AnalyticsText><AnalyticsMoney value={row.amount} kind="body" />
    </View>)}
  </View>;
}
const styles = StyleSheet.create({ link: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingVertical: 8 }, priceBox: { flex: 1, minWidth: 120, gap: 8, padding: 14 }, ring: { width: 76, height: 76 }, ringLabel: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }, track: { height: 8, borderRadius: 8, overflow: 'hidden' }, trend: { gap: 10 }, row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 } });
