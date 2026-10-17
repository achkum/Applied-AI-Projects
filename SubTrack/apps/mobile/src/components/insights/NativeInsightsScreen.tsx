import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useNativeSession } from '@/state/NativeSession';
import type { NativeFeatureSession } from '../onboarding/NativePersonalScreen';
import { useI18n } from '@/context/I18nContext';
import { useTheme } from '@/context/ThemeContext';
import { getColorByTheme } from '@/utils/colors';
import * as privateApi from '@/api/privateMobileApi';
import { createNativeAnalyticsReader, type NativeAnalyticsReader } from '@/api/nativeAnalyticsReader';
import { NativeProductBadge, NativeProductButton, NativeProductCard, NativeProductHeading } from '../billing/NativeProductUI';
import { NativeProductNav } from '../billing/NativeProductNav';
import { AnalyticsBar, AnalyticsLink, AnalyticsMoney, AnalyticsPriceBox, AnalyticsRing, AnalyticsText, AnalyticsTrend } from './NativeAnalyticsUI';
import { useNativeAnalytics } from './useNativeAnalytics';
import { recurringCost } from '../../../../../packages/money/src/recurring-cost';
import { money } from '../../../../../packages/money/src/money';
import { customCategoryLabel } from '../../../../../packages/contracts/subscription-category';
const defaultReader = createNativeAnalyticsReader(privateApi);
const clock = () => new Date();

export function NativeInsightsScreen({ useSession = useNativeSession, reader = defaultReader, now = clock, inactiveContent }: {
  useSession?: () => NativeFeatureSession; reader?: NativeAnalyticsReader; now?: () => Date; inactiveContent?: React.ReactNode;
}) {
  const session = useSession(), router = useRouter(), { t } = useI18n(), { theme, isDark } = useTheme();
  const { value, state, reload } = useNativeAnalytics(session, reader, now);
  const [expanded, setExpanded] = useState(false);
  const color = (key: string) => getColorByTheme(theme, isDark, key);
  const category = (code: string) => customCategoryLabel(code) ?? t(`onboarding.ownerSubscriptions.category.${code}`);
  const name = (id: string) => { const row = value?.active.find(item => item.id === id); return row?.customName ?? row?.merchantName ?? t('nativeAnalytics.unnamed'); };
  const compare = (subscriptionId: string) => router.push({ pathname: '/personal-comparisons', params: { subscriptionId } });
  const costs = value?.active.flatMap(row => { const cost = recurringCost(money(BigInt(row.expectedAmountMinor), row.currency), row.cadence); return cost ? [{ row, cost }] : []; }) ?? [];
  const largest = [...costs].sort((a, b) => a.row.currency.localeCompare(b.row.currency) || (a.cost.monthly.minorUnits > b.cost.monthly.minorUnits ? -1 : a.cost.monthly.minorUnits < b.cost.monthly.minorUnits ? 1 : 0))
    .filter((row, index, all) => index === 0 || row.row.currency !== all[index - 1]!.row.currency);
  return <SafeAreaView style={{ flex: 1, backgroundColor: color('bg.canvas') }}>
    <ScrollView contentContainerStyle={styles.content}>
      <NativeProductHeading title={t('nativeAnalytics.insights')} />
      {session.phase !== 'active' ? inactiveContent ?? <AnalyticsText>{t('nativeAnalytics.loginRequired')}</AnalyticsText> : <>
        {state === 'loading' ? <Text accessibilityLiveRegion="polite" style={{ color: color('ink.secondary') }}>{t('nativeAnalytics.loading')}</Text> : null}
        {state === 'error' ? <Text accessibilityRole="alert" style={{ color: color('ink.primary') }}>{t('nativeAnalytics.unavailable')}</Text> : null}
        {state === 'setup-required' ? <NativeProductButton label={t('nativeAnalytics.finishSetup')} onPress={() => router.replace('/personal')} /> : null}
        {value && state === 'ready' ? <>
          <NativeProductCard>
            <Pressable testID="native-insights-overview" accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={t('nativeAnalytics.overview')} onPress={() => setExpanded(!expanded)} style={styles.overview}>
              <AnalyticsRing count={value.active.length} label={t('nativeAnalytics.activePlans', { count: value.active.length })} />
              <View style={styles.grow}><AnalyticsText kind="title">{t('nativeAnalytics.overview')}</AnalyticsText><AnalyticsText kind="muted">{t('nativeAnalytics.findings', { count: value.priceIncreases.length + value.overlaps.length })}</AnalyticsText></View>
              <AnalyticsText>{expanded ? '−' : '+'}</AnalyticsText>
            </Pressable>
            {expanded ? <View style={styles.chips}>
              {value.categories.map(row => <NativeProductBadge key={row.categoryCode} label={`${category(row.categoryCode)} · ${row.count}`} />)}
              <AnalyticsText kind="muted">{t('nativeAnalytics.method')}</AnalyticsText>
              {value.unknownCadenceCount > 0 ? <AnalyticsText kind="muted">{t('nativeAnalytics.unknownCadence', { count: value.unknownCadenceCount })}</AnalyticsText> : null}
            </View> : null}
          </NativeProductCard>
          <NativeProductCard><AnalyticsText kind="muted">{t('nativeAnalytics.summary')}</AnalyticsText>
            {value.totals.map(row => <View key={row.monthly.currency} style={styles.stack}><AnalyticsMoney value={row.monthly} /><AnalyticsText kind="muted">{t('nativeAnalytics.perMonth')}</AnalyticsText><AnalyticsMoney value={row.annual} kind="body" /><AnalyticsText kind="muted">{t('nativeAnalytics.perYear')}</AnalyticsText></View>)}
            {value.active.length === 0 ? <AnalyticsText>{t('nativeAnalytics.empty')}</AnalyticsText> : <AnalyticsText kind="muted">{t('nativeAnalytics.estimate')}</AnalyticsText>}
          </NativeProductCard>
          <NativeProductHeading title={t('nativeAnalytics.actions')} />
          {value.priceIncreases.map(item => <NativeProductCard key={item.subscriptionId}>
            <View style={styles.cardHeader}><AnalyticsText kind="title">{t('nativeAnalytics.priceRise')}</AnalyticsText><NativeProductBadge label={t('nativeAnalytics.review')} /></View>
            <AnalyticsText>{name(item.subscriptionId)}</AnalyticsText><AnalyticsMoney value={item.monthlyDelta} /><AnalyticsText kind="muted">{t('nativeAnalytics.morePerMonth')}</AnalyticsText>
            <View style={styles.pair}><AnalyticsPriceBox><AnalyticsText kind="muted">{t('nativeAnalytics.previous')}</AnalyticsText><AnalyticsMoney value={item.previous} kind="body" /><AnalyticsBar value={item.previous} maximum={item.current} /></AnalyticsPriceBox><AnalyticsPriceBox><AnalyticsText kind="muted">{t('nativeAnalytics.current')}</AnalyticsText><AnalyticsMoney value={item.current} kind="body" /><AnalyticsBar value={item.current} maximum={item.current} /></AnalyticsPriceBox></View>
            <AnalyticsMoney value={item.annualDelta} kind="body" /><AnalyticsText kind="muted">{t('nativeAnalytics.annualImpact')}</AnalyticsText>
            <AnalyticsText kind="muted">{t('nativeAnalytics.increaseEvidence', { first: item.dates[0]!, last: item.dates[4]! })}</AnalyticsText>
            <AnalyticsLink label={t('nativeAnalytics.compare')} onPress={() => compare(item.subscriptionId)} />
          </NativeProductCard>)}
          {value.overlaps.map(group => <NativeProductCard key={group.categoryCode}><View style={styles.cardHeader}><AnalyticsText kind="title">{category(group.categoryCode)}</AnalyticsText><NativeProductBadge label={t('nativeAnalytics.review')} /></View>
            <AnalyticsText>{t('nativeAnalytics.categoryOverlap', { count: group.count })}</AnalyticsText><AnalyticsText kind="muted">{group.subscriptionIds.map(name).join(' · ')}</AnalyticsText>
            <AnalyticsText kind="muted">{t('nativeAnalytics.overlapEvidence')}</AnalyticsText><AnalyticsLink label={t('nativeAnalytics.compare')} onPress={() => compare(group.subscriptionIds[0]!)} /></NativeProductCard>)}
          {largest.map(item => { const total = value.totals.find(row => row.monthly.currency === item.row.currency)!; return <NativeProductCard key={item.row.currency}><View style={styles.cardHeader}><AnalyticsText kind="title">{t('nativeAnalytics.largest')}</AnalyticsText><NativeProductBadge label={t('nativeAnalytics.review')} /></View>
            <AnalyticsText>{name(item.row.id)}</AnalyticsText><AnalyticsMoney value={item.cost.monthly} /><AnalyticsText kind="muted">{t('nativeAnalytics.perMonth')}</AnalyticsText><AnalyticsBar value={item.cost.monthly} maximum={total.monthly} />
            <AnalyticsLink label={t('nativeAnalytics.compare')} onPress={() => compare(item.row.id)} /></NativeProductCard>; })}
          {value.priceIncreases.length === 0 && value.overlaps.length === 0 ? <AnalyticsText kind="muted">{t('nativeAnalytics.noFindings')}</AnalyticsText> : null}
          <NativeProductHeading title={t('nativeAnalytics.byCategory')} />
          {value.categories.map(group => <NativeProductCard key={group.categoryCode}><AnalyticsText kind="title">{category(group.categoryCode)}</AnalyticsText>{group.totals.map(item => { const total = value.totals.find(row => row.monthly.currency === item.monthly.currency)!; return <View key={item.monthly.currency} style={styles.stack}><AnalyticsMoney value={item.monthly} kind="body" /><AnalyticsBar value={item.monthly} maximum={total.monthly} /></View>; })}</NativeProductCard>)}
          <NativeProductHeading title={t('nativeAnalytics.trend')} />
          <NativeProductCard>{value.historyAvailable ? <><AnalyticsTrend months={value.trend} /><AnalyticsText kind="muted">{t('nativeAnalytics.trendEvidence')}</AnalyticsText>{value.historyTruncated ? <AnalyticsText kind="muted">{t('nativeAnalytics.historyLimited')}</AnalyticsText> : null}</> : <AnalyticsText kind="muted">{t('nativeAnalytics.noHistory')}</AnalyticsText>}</NativeProductCard>
          <NativeProductButton label={t('nativeAnalytics.compare')} variant="primary" onPress={() => router.push('/personal-comparisons')} />
        </> : null}
        <NativeProductButton label={t('nativeAnalytics.refresh')} onPress={() => { void reload(); }} disabled={state === 'loading'} />
      </>}
    </ScrollView>
    {session.phase === 'active' ? <NativeProductNav active="insights" /> : null}
  </SafeAreaView>;
}
const styles = StyleSheet.create({ content: { padding: 24, gap: 16, paddingBottom: 32 }, overview: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 76 }, grow: { flex: 1, gap: 6 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, stack: { gap: 6 }, cardHeader: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }, pair: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 } });
