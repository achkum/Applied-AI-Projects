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
import { AnalyticsBar, AnalyticsLink, AnalyticsMoney, AnalyticsPriceBox, AnalyticsText } from './NativeAnalyticsUI';
const clock = () => new Date();
function HomeScopeChip({ label, selected, onPress, testID, memberId }: { label: string; selected: boolean; onPress: () => void; testID: string; memberId?: string }) {
  const { theme, isDark } = useTheme();
  const color = (key: string) => getColorByTheme(theme, isDark, key);
  const accent = memberId ? theme.memberAccent?.slots[memberAccentForId(memberId)] : null;
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress} style={styles.scopeHit}>
    <View style={[styles.scopePill, { backgroundColor: color(selected ? 'bg.raised' : 'bg.surface'), borderColor: color(selected ? 'action.accent' : 'line.hairline'), borderRadius: theme.radius.pill }]}>
      {memberId ? <View style={{ height: 8, width: 8, borderRadius: theme.radius.pill, backgroundColor: accent ? isDark ? accent.dark : accent.light : color('action.accent') }} /> : null}
      <Text style={{ color: color(selected ? 'ink.primary' : 'ink.secondary'), fontFamily: theme.typography.fontFamily['ui.medium'], fontSize: theme.typography.fontSize.sm }}>{label}</Text>
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
  const increase = value.priceIncreases[0];
  const increasedPlan = increase ? value.active.find(row => row.id === increase.subscriptionId) : null;
  return <View testID="native-home-overview" style={styles.stack}>
    <NativeProductHeading eyebrow={now().toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })} title={household?.name ?? t('onboarding.productNav.home')} trailing={<View style={styles.headerActions}>{headerAction}{all.profile ? <Pressable accessibilityRole="button" accessibilityLabel={t('onboarding.productNav.profile')} onPress={() => router.push('/personal-profile')} style={[styles.avatar, { backgroundColor: getColorByTheme(theme, isDark, 'bg.raised'), borderColor: getColorByTheme(theme, isDark, 'line.hairline'), borderRadius: theme.radius.pill }]}><AnalyticsText kind="title">{all.profile.avatarEmoji ?? all.profile.displayName?.trim().slice(0, 1).toLocaleUpperCase(locale) ?? '·'}</AnalyticsText></Pressable> : null}</View>} />
    {value.totals.map(row => <View key={row.monthly.currency} style={styles.total}><AnalyticsMoney value={row[period]} kind="hero" heroPeriod={t(period === 'monthly' ? 'nativeAnalytics.perMonth' : 'nativeAnalytics.perYear')} /></View>)}
    <View style={styles.summary}><AnalyticsText kind="muted">{t('nativeAnalytics.activePlans', { count: value.active.length })}</AnalyticsText>{value.totals.length > 0 ? <AnalyticsLink label={t(period === 'monthly' ? 'nativeAnalytics.annual' : 'nativeAnalytics.monthly')} onPress={() => setPeriod(period === 'monthly' ? 'annual' : 'monthly')} /> : null}</View>
    {value.unknownCadenceCount > 0 ? <AnalyticsText kind="muted">{t('nativeAnalytics.unknownCadence', { count: value.unknownCadenceCount })}</AnalyticsText> : null}
    {household ? <ScrollView horizontal accessibilityLabel={t('onboarding.nativeHousehold.plannedPayers')} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tiles}><HomeScopeChip testID="native-home-scope-everyone" label={t('onboarding.nativeHousehold.everyone')} selected={selected === null} onPress={() => setSelectedMember(null)} />{household.members.map(member => <HomeScopeChip key={member.id} memberId={member.id} testID={`native-home-scope-${member.id}`} label={member.displayName} selected={selected === member.id} onPress={() => setSelectedMember(selected === member.id ? null : member.id)} />)}</ScrollView> : null}
    {all.active.length === 0 ? <NativeProductCard><AnalyticsText>{t('nativeAnalytics.empty')}</AnalyticsText><NativeProductButton label={t('nativeAnalytics.connectBank')} variant="primary" onPress={() => router.push('/personal-bank')} /><NativeProductButton label={t('nativeAnalytics.addManually')} onPress={() => router.push('/personal')} /></NativeProductCard> : value.active.length === 0 ? <AnalyticsText kind="muted">{t('onboarding.nativeHousehold.noSubscriptions')}</AnalyticsText> : null}
    {typeof children === 'function' ? children(scopedIds) : children}
    <View style={styles.summary}><AnalyticsText kind="title">{t('nativeAnalytics.insights')}</AnalyticsText><AnalyticsLink label={t('nativeAnalytics.seeInsights')} onPress={() => router.push('/personal-insights')} /></View>
    {increase ? <NativeProductCard><AnalyticsText kind="muted">{t('nativeAnalytics.priceRise')}</AnalyticsText><AnalyticsText kind="title">{increasedPlan?.customName ?? increasedPlan?.merchantName ?? t('nativeAnalytics.unnamed')}</AnalyticsText><AnalyticsMoney value={increase.monthlyDelta} /><AnalyticsText kind="muted">{t('nativeAnalytics.morePerMonth')}</AnalyticsText>
      <View style={styles.pair}><AnalyticsPriceBox><AnalyticsText kind="muted">{t('nativeAnalytics.previous')}</AnalyticsText><AnalyticsMoney value={increase.previous} kind="body" /><AnalyticsBar value={increase.previous} maximum={increase.current} /></AnalyticsPriceBox><AnalyticsPriceBox><AnalyticsText kind="muted">{t('nativeAnalytics.current')}</AnalyticsText><AnalyticsMoney value={increase.current} kind="body" /><AnalyticsBar value={increase.current} maximum={increase.current} /></AnalyticsPriceBox></View>
    </NativeProductCard> : <NativeProductCard><AnalyticsText>{t(findings > 0 ? 'nativeAnalytics.findings' : 'nativeAnalytics.noFindings', { count: findings })}</AnalyticsText></NativeProductCard>}
    {value.active.length > 0 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tiles}>
      {value.priceIncreases.length > 0 ? <NativeProductCard style={styles.tile}><AnalyticsText kind="amount">{value.priceIncreases.length}</AnalyticsText><AnalyticsText kind="muted">{t('nativeAnalytics.priceRise')}</AnalyticsText></NativeProductCard> : null}
      <NativeProductCard style={styles.tile}><AnalyticsText kind="amount">{value.categories.length}</AnalyticsText><AnalyticsText kind="muted">{t('nativeAnalytics.byCategory')}</AnalyticsText></NativeProductCard>
      {findings > 0 ? <NativeProductCard style={styles.tile}><AnalyticsText kind="amount">{findings}</AnalyticsText><AnalyticsText kind="muted">{t('nativeAnalytics.actions')}</AnalyticsText></NativeProductCard> : null}
    </ScrollView> : null}
    <View style={styles.actions}><AnalyticsLink label={t('nativeAnalytics.household')} onPress={() => router.push('/personal-household')} /><AnalyticsLink label={t('nativeAnalytics.compare')} onPress={() => router.push('/personal-comparisons')} /></View>
  </View>;
}
const styles = StyleSheet.create({ stack: { gap: 16 }, scopeHit: { minHeight: 44, justifyContent: 'center' }, scopePill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 }, headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 }, avatar: { width: 44, minHeight: 44, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, total: { gap: 4, alignItems: 'flex-start' }, summary: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, pair: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, tiles: { gap: 12 }, tile: { width: 150, minHeight: 104, justifyContent: 'space-between' }, actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 16 } });
