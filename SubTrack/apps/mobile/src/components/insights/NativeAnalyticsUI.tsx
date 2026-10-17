import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Polyline, Polygon, Line, Text as SvgText } from 'react-native-svg';
import { useTheme } from '@/context/ThemeContext';
import { useI18n } from '@/context/I18nContext';
import { getColorByTheme } from '@/utils/colors';
import { formatMinorUnits } from '@/api/privateMobileMoney';
import type { Money } from '../../../../../packages/money/src/money';
import { multiply } from '../../../../../packages/money/src/money';
import { chartPercent } from '../../../../../packages/money/src/recurring-cost';
import type { AnalyticsTrendMonth } from '@/api/nativeAnalyticsProjection';

export function AnalyticsText({ children, kind = 'body' }: { children: React.ReactNode; kind?: 'body' | 'muted' | 'title' | 'amount' | 'hero' | 'label' }) {
  const { theme, isDark } = useTheme();
  return <Text {...(kind === 'hero' ? { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.4, allowFontScaling: true } : {})} style={{ color: getColorByTheme(theme, isDark, kind === 'muted' ? 'ink.secondary' : 'ink.primary'),
    fontFamily: theme.typography.fontFamily[kind === 'hero' || kind === 'amount' ? 'display.extraBold' : kind === 'title' || kind === 'label' ? 'ui.semibold' : 'ui'],
    fontSize: theme.typography.fontSize[kind === 'hero' ? typeof children === 'string' && children.length > 18 ? '2xl' : 'total' : kind === 'amount' ? '2xl' : kind === 'muted' ? 'sm' : kind === 'label' ? 'xs' : 'md'],
    ...(kind === 'hero' ? { textAlign: 'left' as const, fontVariant: ['tabular-nums' as const], alignSelf: 'stretch' as const, minWidth: 0 } : {}) }}>{children}</Text>;
}
export function AnalyticsMoney({ value, kind = 'amount', heroPeriod }: { value: Money; kind?: 'body' | 'muted' | 'title' | 'amount' | 'hero' | 'label'; heroPeriod?: string }) {
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
export function AnalyticsLink({ label, onPress, pill = false }: { label: string; onPress: () => void; pill?: boolean }) {
  const { theme, isDark } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.link}>
    <View style={pill ? {borderWidth:1,borderColor:getColorByTheme(theme,isDark,'line.hairline'),borderRadius:theme.radius.pill,paddingHorizontal:12,paddingVertical:6} : undefined}>
    <Text style={{ color: getColorByTheme(theme, isDark, 'action.accent'), fontFamily: theme.typography.fontFamily['ui.medium'], fontSize: theme.typography.fontSize.sm }}>{label}</Text>
    </View>
  </Pressable>;
}
export function AnalyticsBadge({label,tone='review'}:{label:string;tone?:'review'|'warning'|'positive'}) {
  const {theme,isDark}=useTheme();const color=getColorByTheme(theme,isDark,tone==='warning'?'status.warning':tone==='positive'?'status.positive':'action.accent');
  return <View style={{alignSelf:'flex-start',borderWidth:1,borderColor:color,borderRadius:theme.radius.pill,paddingHorizontal:9,paddingVertical:3}}><Text style={{color,fontFamily:theme.typography.fontFamily['ui.semibold'],fontSize:theme.typography.fontSize.xs}}>{label}</Text></View>;
}
export function AnalyticsPriceBox({ children, positive = false }: { children: React.ReactNode; positive?: boolean }) {
  const { theme, isDark } = useTheme();
  return <View style={[styles.priceBox, { borderRadius: 10, backgroundColor: getColorByTheme(theme, isDark, 'bg.raised'), ...(positive ? {borderWidth:1,borderColor:getColorByTheme(theme,isDark,'status.positive')} : {}) }]}>{children}</View>;
}
export function AnalyticsBar({ value, maximum }: { value: Money; maximum: Money }) {
  const { theme, isDark } = useTheme();
  const percentage = chartPercent(value, maximum);
  return <View accessible={false} style={[styles.track, { backgroundColor: getColorByTheme(theme, isDark, 'bg.raised') }]}>
    <View style={{ width: `${percentage}%`, height: 8, borderRadius: theme.radius.pill, backgroundColor: getColorByTheme(theme, isDark, 'action.accent') }} />
  </View>;
}
export function AnalyticsComparisonBars({rows,maximum}:{rows:readonly {label:string;amount:Money}[];maximum:Money}) {
  return <View style={{gap:10}}>{rows.map(row=><View key={row.label} style={{flexDirection:'row',alignItems:'center',gap:10}}><View style={{width:74}}><AnalyticsText kind="muted">{row.label}</AnalyticsText></View><View style={{flex:1}}><AnalyticsBar value={row.amount} maximum={maximum}/></View><View style={{minWidth:72,alignItems:'flex-end'}}><AnalyticsMoney value={row.amount} kind="label"/></View></View>)}</View>;
}

/** Compact reference chart; its native accessible label retains every exact month/value/count. */
export function AnalyticsTrend({ months }: { months: readonly AnalyticsTrendMonth[] }) {
  const { theme, isDark } = useTheme(), { t, locale } = useI18n();
  const chartFont=theme.typography.fontFamily['ui.medium']!,chartStrongFont=theme.typography.fontFamily['ui.semibold']!,chartFontSize=theme.typography.fontSize.xs!;
  if(months.length===0)return null;
  const maximum = months.reduce((largest, row) => row.amount.minorUnits > largest.minorUnits ? row.amount : largest, months[0]!.amount);
  const color = getColorByTheme(theme, isDark, 'action.accent'), muted=getColorByTheme(theme,isDark,'ink.secondary');
  const x=(index:number)=>40+index*276/Math.max(1,months.length-1),y=(value:Money)=>142-chartPercent(value,maximum)*1.22;
  const points = months.map((row, index) => `${x(index)},${y(row.amount)}`).join(' ');
  const monthLabel=(month:string)=>new Intl.DateTimeFormat(locale,{month:'short'}).format(new Date(Number(month.slice(0,4)),Number(month.slice(5,7))-1,1));
  const last=months[months.length-1]!;
  const values=months.map(row=>`${row.month}, ${formatMinorUnits(row.amount.minorUnits,row.amount.currency,{locale,display:'code'})}, ${t('nativeAnalytics.charges',{count:row.chargeCount})}`).join('; ');
  const numeric=(value:Money)=>formatMinorUnits(value.minorUnits,value.currency,{locale,display:'code'}).replace(value.currency,'').trim();
  return <View testID="native-insights-trend" accessible accessibilityLabel={`${t('nativeAnalytics.trend')}. ${values}`} style={styles.trend}>
    <Svg height={168} width="100%" viewBox="0 0 330 168" accessible={false}>
      {(maximum.minorUnits===0n?[0n]:[0n,1n,2n,3n]).map(step=>{const tick=multiply(maximum,step,3n),label=numeric(tick);return <React.Fragment key={step.toString()}><Line x1={40} x2={316} y1={y(tick)} y2={y(tick)} stroke={getColorByTheme(theme,isDark,'line.hairline')}/><SvgText x={32} y={y(tick)+4} textAnchor="end" {...(label.length>4?{textLength:32,lengthAdjust:'spacingAndGlyphs' as const}:{})} fill={muted} fontFamily={chartFont} fontSize={chartFontSize}>{label}</SvgText></React.Fragment>;})}
      <Polygon points={`${x(0)},142 ${points} ${x(months.length-1)},142`} fill={color} fillOpacity={0.16}/>
      <Polyline points={points} fill="none" stroke={color} strokeWidth={3} strokeLinejoin="round" />
      {months.map((row,index)=><React.Fragment key={row.month}><Circle cx={x(index)} cy={y(row.amount)} r={index===months.length-1?4.5:3} fill={index===months.length-1?color:getColorByTheme(theme,isDark,'bg.surface')} stroke={color} strokeWidth={2}/><SvgText x={x(index)} y={160} textAnchor="middle" fill={muted} fontFamily={chartFont} fontSize={chartFontSize}>{monthLabel(row.month)}</SvgText></React.Fragment>)}
      <SvgText x={x(months.length-1)-8} y={Math.max(12,y(last.amount)-10)} textAnchor="end" fill={getColorByTheme(theme,isDark,'ink.primary')} fontFamily={chartStrongFont} fontSize={chartFontSize}>{formatMinorUnits(last.amount.minorUnits,last.amount.currency,{locale,display:'code'})}</SvgText>
    </Svg>
    <View style={[styles.row,{borderTopWidth:1,borderTopColor:getColorByTheme(theme,isDark,'line.hairline'),paddingTop:10}]}><AnalyticsText kind="muted">{t('nativeAnalytics.availableHistory')}</AnalyticsText><AnalyticsText kind="muted">{`${monthLabel(months[0]!.month)} – ${monthLabel(last.month)}`}</AnalyticsText></View>
  </View>;
}
const styles = StyleSheet.create({ link: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }, priceBox: { flex: 1, minWidth: 100, gap: 4, padding: 10 }, track: { height: 8, borderRadius: 8, overflow: 'hidden' }, trend: { gap: 10 }, row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 } });
