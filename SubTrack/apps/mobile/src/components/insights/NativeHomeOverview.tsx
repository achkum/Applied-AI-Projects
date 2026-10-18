import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { memberAccentForId } from '@subtrack/ui-tokens/member-accent';
import { useRouter } from 'expo-router';
import type { NativeFeatureSession } from '../onboarding/NativePersonalScreen';
import type { NativeAnalyticsReader } from '@/api/nativeAnalyticsReader';
import { useI18n } from '@/context/I18nContext';
import { useTheme } from '@/context/ThemeContext';
import { getColorByTheme } from '@/utils/colors';
import { NativeProductButton, NativeProductCard, NativeProductHeading } from '../billing/NativeProductUI';
import { scopeNativeAnalytics } from '@/api/nativeAnalyticsProjection';
import { useNativeAnalytics } from './useNativeAnalytics';
import { AnalyticsComparisonBars, AnalyticsLink, AnalyticsMoney, AnalyticsText } from './NativeAnalyticsUI';
const clock = () => new Date();
function HomeScopeChip({ label, selected, onPress, testID, memberId }: { label: string; selected: boolean; onPress: () => void; testID: string; memberId?: string }) {
  const { theme, isDark } = useTheme();
  const color = (key: string) => getColorByTheme(theme, isDark, key);
  const accent = memberId ? theme.memberAccent?.slots[memberAccentForId(memberId)] : null;
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress} style={styles.scopeHit}>
    <View style={[styles.scopePill, { backgroundColor: color(selected ? 'ink.primary' : 'bg.canvas'), borderColor: color(selected ? 'ink.primary' : 'line.hairline'), borderRadius: theme.radius.pill }]}>
      {memberId ? <View style={{ height: 8, width: 8, borderRadius: theme.radius.pill, backgroundColor: accent ? isDark ? accent.dark : accent.light : color('action.accent') }} /> : null}
      <Text style={{ color: color(selected ? 'bg.canvas' : 'ink.secondary'), fontFamily: theme.typography.fontFamily['ui.medium'], fontSize: theme.typography.fontSize.link }}>{label}</Text>
    </View>
  </Pressable>;
}

/** The same authorized projection as Insights. No new backend authority or fixture totals. */
export function NativeHomeOverview({ session, reader, now = clock, children, headerAction }: { session: NativeFeatureSession; reader: NativeAnalyticsReader; now?: () => Date; children?: React.ReactNode | ((ids: ReadonlySet<string> | null) => React.ReactNode); headerAction?: React.ReactNode }) {
  const { value: all, state, reload } = useNativeAnalytics(session, reader, now), { t, locale } = useI18n(), router = useRouter(), { theme, isDark } = useTheme();
  const [period, setPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  if (session.phase !== 'active') return null;
  if (state === 'loading') return <AnalyticsText kind="muted">{t('nativeAnalytics.loading')}</AnalyticsText>;
  if (state === 'error') return <NativeProductCard><AnalyticsText kind="muted">{t('nativeAnalytics.unavailable')}</AnalyticsText><NativeProductButton label={t('nativeAnalytics.refresh')} onPress={() => { void reload(); }} /></NativeProductCard>;
  if (!all) return null;
  const household = all.household;
  const selected = household?.members.some(member => member.id === selectedMember) ? selectedMember : null;
  const scopedIds = selected === null ? null : new Set(household!.assignments.filter(row => row.payerMemberId === selected && all.active.some(plan => plan.id === row.subscriptionId)).map(row => row.subscriptionId));
  const value = scopedIds === null ? all : scopeNativeAnalytics(all, scopedIds, now());
  const findings = value.priceIncreases.length + value.overlaps.length;
  const sharedPlans=household?.assignments.filter(assignment=>value.active.some(plan=>plan.id===assignment.subscriptionId)&&household.members.filter(member=>assignment.memberIds.includes(member.id)).length>1).length??0;
  const openInsights=()=>router.push(selected?{pathname:'/personal-insights',params:{memberId:selected}}:'/personal-insights');
  const increase = value.priceIncreases[0];
  const increasedPlan = increase ? value.active.find(row => row.id === increase.subscriptionId) : null;
  return <View testID="native-home-overview" style={styles.stack}>
    <NativeProductHeading eyebrow={now().toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })} title={household?.name ?? t('onboarding.productNav.home')} trailing={<View style={styles.headerActions}>{headerAction}{all.profile ? <Pressable accessibilityRole="button" accessibilityLabel={t('onboarding.productNav.profile')} onPress={() => router.push('/personal-profile')} style={styles.avatarHit}><View style={[styles.avatar, { backgroundColor: getColorByTheme(theme, isDark, 'bg.raised'),borderRadius: theme.radius.pill }]}><AnalyticsText kind="title">{all.profile.avatarEmoji ?? all.profile.displayName?.trim().slice(0, 1).toLocaleUpperCase(locale) ?? '·'}</AnalyticsText></View></Pressable> : null}</View>} />
    {value.totals.map((row,index) => <View key={row.monthly.currency} style={styles.total}><AnalyticsMoney value={row[period]} kind="hero" heroPeriod={t(period === 'monthly' ? 'nativeAnalytics.perMonth' : 'nativeAnalytics.perYear')} heroAction={index===0?<AnalyticsLink label={t(period === 'monthly' ? 'nativeAnalytics.annual' : 'nativeAnalytics.monthly')} onPress={() => setPeriod(period === 'monthly' ? 'annual' : 'monthly')}/>:null}/></View>)}
    <View style={styles.summary}><AnalyticsText kind="muted">{t('nativeAnalytics.activePlans', { count: value.active.length })}</AnalyticsText></View>
    {value.unknownCadenceCount > 0 ? <AnalyticsText kind="muted">{t('nativeAnalytics.unknownCadence', { count: value.unknownCadenceCount })}</AnalyticsText> : null}
    {household ? <ScrollView horizontal accessibilityLabel={t('onboarding.nativeHousehold.plannedPayers')} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tiles}><HomeScopeChip testID="native-home-scope-everyone" label={t('onboarding.nativeHousehold.everyone')} selected={selected === null} onPress={() => setSelectedMember(null)} />{household.members.map(member => <HomeScopeChip key={member.id} memberId={member.id} testID={`native-home-scope-${member.id}`} label={member.displayName} selected={selected === member.id} onPress={() => setSelectedMember(selected === member.id ? null : member.id)} />)}</ScrollView> : null}
    {all.active.length === 0 ? <NativeProductCard><AnalyticsText>{t('nativeAnalytics.empty')}</AnalyticsText><NativeProductButton label={t('nativeAnalytics.connectBank')} variant="primary" onPress={() => router.push('/personal-bank')} /><NativeProductButton label={t('nativeAnalytics.addManually')} onPress={() => router.push('/personal')} /></NativeProductCard> : value.active.length === 0 ? <AnalyticsText kind="muted">{t('onboarding.nativeHousehold.noSubscriptions')}</AnalyticsText> : null}
    {typeof children === 'function' ? children(scopedIds) : children}
    <NativeProductHeading level="section" title={t('nativeAnalytics.insights')} trailing={<AnalyticsLink label={t('nativeAnalytics.seeInsights')} onPress={openInsights}/>}/>
    {increase ? <Pressable accessibilityRole="button" accessibilityLabel={`${t('nativeAnalytics.priceRise')}. ${increasedPlan?.customName??increasedPlan?.merchantName??t('nativeAnalytics.unnamed')}`} onPress={openInsights}><NativeProductCard><AnalyticsText kind="muted">{t('nativeAnalytics.priceRise')}</AnalyticsText><View style={styles.amountRow}><AnalyticsMoney value={increase.monthlyDelta}/><AnalyticsText kind="muted">{t('nativeAnalytics.morePerMonth')}</AnalyticsText></View><AnalyticsText kind="muted">{increasedPlan?.customName??increasedPlan?.merchantName??t('nativeAnalytics.unnamed')}</AnalyticsText><AnalyticsComparisonBars rows={[{label:t('nativeAnalytics.previous'),amount:increase.previous},{label:t('nativeAnalytics.current'),amount:increase.current}]} maximum={increase.current}/></NativeProductCard></Pressable> : <NativeProductCard><AnalyticsText>{t(findings > 0 ? 'nativeAnalytics.findings' : 'nativeAnalytics.noFindings', { count: findings })}</AnalyticsText></NativeProductCard>}
    {value.active.length>0?<View style={styles.stats}>{[{count:value.priceIncreases.length,label:t('nativeAnalytics.priceRise'),route:'insights'},{count:value.categories.length,label:t('nativeAnalytics.byCategory'),route:'insights'},{count:sharedPlans,label:t('nativeAnalytics.sharedPlans'),route:'household'},{count:findings,label:t('nativeAnalytics.actions'),route:'insights'}].map(stat=><Pressable key={stat.label} accessibilityRole="button" accessibilityLabel={`${stat.count} ${stat.label}`} onPress={()=>stat.route==='insights'?openInsights():router.push('/personal-household')} style={[styles.stat,{backgroundColor:getColorByTheme(theme,isDark,'bg.surface'),borderRadius:14}]}><Text style={{color:getColorByTheme(theme,isDark,'ink.primary'),fontFamily:theme.typography.fontFamily.display,fontSize:theme.typography.fontSize.stat,lineHeight:theme.typography.fontSize.stat!*1.1,letterSpacing:theme.typography.fontSize.stat!*-.02,fontVariant:['tabular-nums']}}>{stat.count}</Text><Text style={{textAlign:'center',color:getColorByTheme(theme,isDark,'ink.secondary'),fontFamily:theme.typography.fontFamily.ui,fontSize:theme.typography.fontSize.statLabel,lineHeight:theme.typography.fontSize.statLabel!*1.25}}>{stat.label}</Text></Pressable>)}</View>:null}
  </View>;
}
const styles = StyleSheet.create({ stack: { gap:16 }, scopeHit: { minHeight:44,justifyContent:'center' }, scopePill: { flexDirection:'row',alignItems:'center',gap:7,borderWidth:1,paddingHorizontal:14,paddingVertical:7 }, headerActions: { flexDirection:'row',alignItems:'center',gap:8 },avatarHit:{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'}, avatar: { width:36,height:36,alignItems:'center',justifyContent:'center' }, total: { gap:4,alignItems:'flex-start' }, summary: {marginTop:-6,flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:12 }, tiles:{gap:6},amountRow:{flexDirection:'row',alignItems:'baseline',flexWrap:'wrap',gap:6},stats:{flexDirection:'row',gap:8},stat:{flex:1,minWidth:0,minHeight:68,paddingHorizontal:4,paddingTop:12,paddingBottom:10,alignItems:'center',gap:3} });
