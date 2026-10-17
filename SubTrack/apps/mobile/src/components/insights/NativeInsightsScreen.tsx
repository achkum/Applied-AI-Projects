import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useNativeSession } from '@/state/NativeSession';
import type { NativeFeatureSession } from '../onboarding/NativePersonalScreen';
import { useI18n } from '@/context/I18nContext';
import { useTheme } from '@/context/ThemeContext';
import { getColorByTheme } from '@/utils/colors';
import * as privateApi from '@/api/privateMobileApi';
import { createNativeAnalyticsReader, type NativeAnalyticsReader } from '@/api/nativeAnalyticsReader';
import { NativeProductButton, NativeProductCard, NativeProductHeading } from '../billing/NativeProductUI';
import { NativeProductNav } from '../billing/NativeProductNav';
import { AnalyticsBadge, AnalyticsBar, AnalyticsLink, AnalyticsMoney, AnalyticsPriceBox, AnalyticsText, AnalyticsTrend } from './NativeAnalyticsUI';
import {compareNativePlans} from '@/api/nativeAnalyticsProjection';
import {formatMinorUnits} from '@/api/privateMobileMoney';
import {BillingIcon} from '../billing/BillingIcon';
import { useNativeAnalytics } from './useNativeAnalytics';
import { recurringCost } from '../../../../../packages/money/src/recurring-cost';
import { money } from '../../../../../packages/money/src/money';
import { customCategoryLabel } from '../../../../../packages/contracts/subscription-category';
const defaultReader = createNativeAnalyticsReader(privateApi);
const clock = () => new Date();

export function NativeInsightsScreen({ useSession = useNativeSession, reader = defaultReader, now = clock, inactiveContent }: {
  useSession?: () => NativeFeatureSession; reader?: NativeAnalyticsReader; now?: () => Date; inactiveContent?: React.ReactNode;
}) {
  const session = useSession(), router = useRouter(), { t, locale } = useI18n(), { theme, isDark } = useTheme();
  const { value, state, reload } = useNativeAnalytics(session, reader, now);
  const [expanded, setExpanded] = useState(false);
  const color = (key: string) => getColorByTheme(theme, isDark, key);
  const category = (code: string) => customCategoryLabel(code) ?? t(`onboarding.ownerSubscriptions.category.${code}`);
  const name = (id: string) => { const row = value?.active.find(item => item.id === id); return row?.customName ?? row?.merchantName ?? t('nativeAnalytics.unnamed'); };
  const compare = (subscriptionId: string) => router.push({ pathname: '/personal-comparisons', params: { subscriptionId } });
  const costs = value?.active.flatMap(row => { const cost = recurringCost(money(BigInt(row.expectedAmountMinor), row.currency), row.cadence); return cost ? [{ row, cost }] : []; }) ?? [];
  const largest = [...costs].sort((a, b) => a.row.currency.localeCompare(b.row.currency) || (a.cost.monthly.minorUnits > b.cost.monthly.minorUnits ? -1 : a.cost.monthly.minorUnits < b.cost.monthly.minorUnits ? 1 : 0))
    .filter((row, index, all) => index === 0 || row.row.currency !== all[index - 1]!.row.currency);
  const datedMonths=value?.historyAvailable?value.trend:[];
  const monthLabel=(month:string)=>new Intl.DateTimeFormat(locale,{month:'long'}).format(new Date(Number(month.slice(0,4)),Number(month.slice(5,7))-1,1));
  const dateline=datedMonths.length?`${monthLabel(datedMonths[0]!.month)} – ${monthLabel(datedMonths[datedMonths.length-1]!.month)}`:undefined;
  const comparisons=value?.plans.filter(plan=>plan.source==='saved').flatMap(plan=>{const alternative=value.plans.find(other=>other.id!==plan.id&&other.categoryCode===plan.categoryCode&&other.currency===plan.currency&&other.source==='synthetic-persona-fixture');const difference=alternative?compareNativePlans(plan,alternative):null;return alternative&&difference?[{plan,alternative,difference}]:[];})??[];
  return <SafeAreaView style={{ flex: 1, backgroundColor: color('bg.canvas') }}>
    <ScrollView testID="native-insights-scroll" alwaysBounceVertical contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={session.phase==='active'&&state==='loading'} enabled={session.phase==='active'} onRefresh={()=>{void reload();}} tintColor={color('action.accent')}/>}>
      <NativeProductHeading eyebrow={dateline} title={t('nativeAnalytics.insights')} />
      {session.phase !== 'active' ? inactiveContent ?? <AnalyticsText>{t('nativeAnalytics.loginRequired')}</AnalyticsText> : <>
        {state === 'loading' ? <Text accessibilityLiveRegion="polite" style={{ color: color('ink.secondary') }}>{t('nativeAnalytics.loading')}</Text> : null}
        {state === 'error' ? <Text accessibilityRole="alert" style={{ color: color('ink.primary') }}>{t('nativeAnalytics.unavailable')}</Text> : null}
        {state === 'setup-required' ? <NativeProductButton label={t('nativeAnalytics.finishSetup')} onPress={() => router.replace('/personal')} /> : null}
        {value && state === 'ready' ? <>
          <NativeProductCard>
            <Pressable testID="native-insights-overview" accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={`${t('nativeAnalytics.overview')}. ${t('nativeAnalytics.activePlans', { count: value.active.length })}. ${t('nativeAnalytics.findings', { count: value.priceIncreases.length + value.overlaps.length })}`} onPress={() => setExpanded(!expanded)} style={styles.overview}>
              <View style={styles.grow}><AnalyticsText kind="title">{t('nativeAnalytics.overview')}</AnalyticsText><AnalyticsText kind="muted">{t('nativeAnalytics.activePlans', { count: value.active.length })} · {t('nativeAnalytics.findings', { count: value.priceIncreases.length + value.overlaps.length })}</AnalyticsText></View>
              <View style={expanded?{transform:[{rotate:'90deg'}]}:undefined}><BillingIcon name="next" size={16} color={color('ink.secondary')}/></View>
            </Pressable>
            {expanded ? <View style={styles.chips}>
              {value.categories.map(row => <AnalyticsBadge key={row.categoryCode} label={`${category(row.categoryCode)} · ${row.count}`} />)}
              <AnalyticsText kind="muted">{t('nativeAnalytics.method')}</AnalyticsText>
            </View> : null}
          </NativeProductCard>
          <NativeProductCard><Text style={{color:color('action.accent'),fontFamily:theme.typography.fontFamily['ui.semibold'],fontSize:theme.typography.fontSize.xs,textTransform:'uppercase',letterSpacing:0.7}}>{t('nativeAnalytics.summary')}</Text>
            {value.totals.map(row => <AnalyticsText key={row.monthly.currency}>{t('nativeAnalytics.summaryMonthly',{amount:formatMinorUnits(row.monthly.minorUnits,row.monthly.currency,{locale,display:'code'}),count:costs.filter(item=>item.row.currency===row.monthly.currency).length})}</AnalyticsText>)}
            {value.overlaps.length>0?<AnalyticsText>{t('nativeAnalytics.summaryOverlap',{count:value.overlaps.length})}</AnalyticsText>:null}
            {value.unknownCadenceCount > 0 ? <AnalyticsText kind="muted">{t('nativeAnalytics.unknownCadence', { count: value.unknownCadenceCount })}</AnalyticsText> : null}
            {value.active.length === 0 ? <AnalyticsText>{t('nativeAnalytics.empty')}</AnalyticsText> : null}
          </NativeProductCard>
          <NativeProductHeading level="section" title={t('nativeAnalytics.actions')} />
          {value.priceIncreases.map(item => <NativeProductCard key={item.subscriptionId}>
            <View style={styles.cardHeader}><AnalyticsText kind="title">{t('nativeAnalytics.priceRise')}</AnalyticsText><AnalyticsBadge tone="warning" label={t('nativeAnalytics.review')} /></View>
            <View style={styles.inlineAmount}><AnalyticsMoney value={item.monthlyDelta} /><AnalyticsText kind="muted">{t('nativeAnalytics.morePerMonth')}</AnalyticsText></View><AnalyticsText kind="muted">{name(item.subscriptionId)}</AnalyticsText>
            <View style={styles.pair}><AnalyticsPriceBox><AnalyticsText kind="label">{t('nativeAnalytics.previous')}</AnalyticsText><AnalyticsMoney value={item.previous} kind="body" /></AnalyticsPriceBox><AnalyticsPriceBox><AnalyticsText kind="label">{t('nativeAnalytics.current')}</AnalyticsText><AnalyticsMoney value={item.current} kind="body" /></AnalyticsPriceBox></View>
            <AnalyticsText kind="muted">{t('nativeAnalytics.increaseEvidence', { first: item.dates[0]!, last: item.dates[4]! })}</AnalyticsText>
            <AnalyticsLink pill label={t('nativeAnalytics.openPlan',{name:name(item.subscriptionId)})} onPress={() => compare(item.subscriptionId)} />
          </NativeProductCard>)}
          {value.overlaps.map(group => <NativeProductCard key={group.categoryCode}><View style={styles.cardHeader}><AnalyticsText kind="title">{category(group.categoryCode)}</AnalyticsText><AnalyticsBadge label={t('nativeAnalytics.review')} /></View>
            <AnalyticsText>{t('nativeAnalytics.categoryOverlap', { count: group.count })}</AnalyticsText><AnalyticsText kind="muted">{group.subscriptionIds.map(name).join(' · ')}</AnalyticsText>
            <View style={styles.pair}>{group.subscriptionIds.map(id=>{const cost=costs.find(item=>item.row.id===id);return cost?<AnalyticsPriceBox key={id}><AnalyticsText kind="label">{name(id)}</AnalyticsText><AnalyticsMoney value={cost.cost.monthly} kind="body"/></AnalyticsPriceBox>:null;})}</View>
            <AnalyticsText kind="muted">{t('nativeAnalytics.overlapEvidence')}</AnalyticsText><View style={styles.links}>{group.subscriptionIds.map(id=><AnalyticsLink key={id} pill label={t('nativeAnalytics.openPlan',{name:name(id)})} onPress={()=>compare(id)}/>)}</View></NativeProductCard>)}
          {largest.map(item => { const total = value.totals.find(row => row.monthly.currency === item.row.currency)!; return <NativeProductCard key={item.row.currency}><View style={styles.cardHeader}><AnalyticsText kind="title">{t('nativeAnalytics.largest')}</AnalyticsText><AnalyticsBadge label={t('nativeAnalytics.review')} /></View>
            <View style={styles.inlineAmount}><AnalyticsMoney value={item.cost.monthly} /><AnalyticsText kind="muted">{t('nativeAnalytics.perMonth')}</AnalyticsText></View><AnalyticsText kind="muted">{name(item.row.id)}</AnalyticsText><AnalyticsBar value={item.cost.monthly} maximum={total.monthly} />
            <AnalyticsLink pill label={t('nativeAnalytics.openPlan',{name:name(item.row.id)})} onPress={() => compare(item.row.id)} /></NativeProductCard>; })}
          {value.priceIncreases.length === 0 && value.overlaps.length === 0 ? <AnalyticsText kind="muted">{t('nativeAnalytics.noFindings')}</AnalyticsText> : null}
          {comparisons.length?<><NativeProductHeading level="section" title={t('nativeAnalytics.sameCategory')}/>{comparisons.map(({plan,alternative,difference})=>{const left=recurringCost(money(BigInt(plan.amountMinor),plan.currency),plan.cadence)!,right=recurringCost(money(BigInt(alternative.amountMinor),alternative.currency),alternative.cadence)!;return <NativeProductCard key={plan.id}><View style={styles.cardHeader}><View style={styles.grow}><AnalyticsText kind="title">{t('nativeAnalytics.comparisonTitle',{name:plan.name,alternative:alternative.name})}</AnalyticsText></View><AnalyticsBadge label={t('nativeAnalytics.samplePrice')}/></View><View style={styles.pair}><AnalyticsPriceBox><AnalyticsText kind="label">{t('nativeAnalytics.currentPlan')}</AnalyticsText><AnalyticsMoney value={left.monthly} kind="body"/></AnalyticsPriceBox><AnalyticsPriceBox positive={difference.monthly.minorUnits>0n}><AnalyticsText kind="label">{t('nativeAnalytics.alternative')}</AnalyticsText><AnalyticsMoney value={right.monthly} kind="body"/></AnalyticsPriceBox></View><AnalyticsText kind="muted">{t('nativeAnalytics.fixtureSource')}</AnalyticsText><AnalyticsLink pill label={t('nativeAnalytics.compare')} onPress={()=>compare(plan.subscriptionId!)}/></NativeProductCard>;})}</>:null}
          <NativeProductHeading level="section" title={t('nativeAnalytics.trend')} />
          <NativeProductCard>{value.historyAvailable ? <><AnalyticsTrend months={value.trend} /><AnalyticsText kind="muted">{t('nativeAnalytics.trendEvidence')}</AnalyticsText>{value.historyTruncated ? <AnalyticsText kind="muted">{t('nativeAnalytics.historyLimited')}</AnalyticsText> : null}</> : <AnalyticsText kind="muted">{t('nativeAnalytics.noHistory')}</AnalyticsText>}</NativeProductCard>
          <NativeProductButton label={t('nativeAnalytics.compare')} variant="primary" onPress={() => router.push('/personal-comparisons')} />
        </> : null}
        {state==='error'?<NativeProductButton compact label={t('actions.retry')} onPress={()=>{void reload();}}/>:null}
      </>}
    </ScrollView>
    {session.phase === 'active' ? <NativeProductNav active="insights" /> : null}
  </SafeAreaView>;
}
const styles = StyleSheet.create({ content: { paddingHorizontal:20,paddingTop:18,gap:10,paddingBottom:32 }, overview: { flexDirection:'row',alignItems:'center',gap:16,minHeight:44 }, grow: { flex:1,minWidth:0,gap:4 }, chips: { flexDirection:'row',flexWrap:'wrap',gap:6,paddingTop:14 }, cardHeader: { flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10 }, pair: { flexDirection:'row',flexWrap:'wrap',gap:6 }, inlineAmount:{flexDirection:'row',alignItems:'baseline',flexWrap:'wrap',gap:6},links:{flexDirection:'row',flexWrap:'wrap',gap:6} });
