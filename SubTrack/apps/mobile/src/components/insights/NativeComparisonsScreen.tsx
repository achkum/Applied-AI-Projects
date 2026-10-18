import React, { useState } from 'react';
import {Pressable,RefreshControl,ScrollView,StyleSheet,Text,View} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useNativeSession } from '@/state/NativeSession';
import type { NativeFeatureSession } from '../onboarding/NativePersonalScreen';
import { useI18n } from '@/context/I18nContext';
import { useTheme } from '@/context/ThemeContext';
import { getColorByTheme } from '@/utils/colors';
import * as privateApi from '@/api/privateMobileApi';
import { createNativeAnalyticsReader, type NativeAnalyticsReader } from '@/api/nativeAnalyticsReader';
import { compareNativePlans,isNativeComparisonAlternative } from '@/api/nativeAnalyticsProjection';
import { recurringCost } from '../../../../../packages/money/src/recurring-cost';
import { money, multiply } from '../../../../../packages/money/src/money';
import { NativeProductButton, NativeProductCard, NativeProductHeading } from '../billing/NativeProductUI';
import { AnalyticsBadge, AnalyticsLink, AnalyticsMoney, AnalyticsPriceBox, AnalyticsText } from './NativeAnalyticsUI';
import { useNativeAnalytics } from './useNativeAnalytics';
import { NativeProductNav } from '../billing/NativeProductNav';
const defaultReader = createNativeAnalyticsReader(privateApi), clock = () => new Date();

export function NativeComparisonsScreen({ useSession = useNativeSession, reader = defaultReader, now = clock, inactiveContent, initialSubscriptionId }: {
  useSession?: () => NativeFeatureSession; reader?: NativeAnalyticsReader; now?: () => Date; inactiveContent?: React.ReactNode; initialSubscriptionId?: string;
}) {
  const session = useSession(), router = useRouter(), { t } = useI18n(), { theme, isDark } = useTheme();
  const { value, state, reload } = useNativeAnalytics(session, reader, now), [selection, setSelection] = useState<string | null>(null);
  const [period, setPeriod] = useState<'monthly' | 'annual'>('monthly');
  const saved = value?.plans.filter(row => row.source === 'saved') ?? [];
  const selected = saved.find(row => row.id === selection) ?? saved.find(row => row.subscriptionId === initialSubscriptionId) ?? saved[0];
  const alternatives = selected ? value?.plans.filter(row => isNativeComparisonAlternative(selected,row)) ?? [] : [];
  return <SafeAreaView style={{ flex: 1, backgroundColor: getColorByTheme(theme, isDark, 'bg.canvas') }}><ScrollView testID="native-comparisons-scroll" alwaysBounceVertical contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={session.phase==='active'&&state==='loading'} enabled={session.phase==='active'} onRefresh={()=>{void reload();}} tintColor={getColorByTheme(theme,isDark,'action.accent')}/>}>
    <AnalyticsLink label={t('nativeAnalytics.backToInsights')} onPress={() => router.replace('/personal-insights')} />
    <NativeProductHeading title={t('nativeAnalytics.comparisons')} />
    {session.phase !== 'active' ? inactiveContent ?? <AnalyticsText>{t('nativeAnalytics.loginRequired')}</AnalyticsText> : <>
      {state === 'loading' ? <AnalyticsText kind="muted">{t('nativeAnalytics.loading')}</AnalyticsText> : null}
      {state === 'error' ? <AnalyticsText>{t('nativeAnalytics.unavailable')}</AnalyticsText> : null}
      {state === 'setup-required' ? <NativeProductButton label={t('nativeAnalytics.finishSetup')} onPress={() => router.replace('/personal')} /> : null}
      {value && state === 'ready' ? <>
        {saved.length === 0 ? <NativeProductCard><AnalyticsText>{t('nativeAnalytics.empty')}</AnalyticsText><NativeProductButton label={t('nativeAnalytics.openSubscriptions')} onPress={() => router.replace('/personal')} /></NativeProductCard> : <>
          <NativeProductHeading level="section" title={t('nativeAnalytics.yourPlans')}/>
          <ScrollView horizontal contentContainerStyle={styles.choices} showsHorizontalScrollIndicator={false}>
            {saved.map(plan=><Pressable key={plan.id} testID={`native-comparison-select-${plan.subscriptionId}`} accessibilityRole="button" accessibilityLabel={plan.name||t('nativeAnalytics.unnamed')} accessibilityState={{selected:selected?.id===plan.id}} onPress={()=>setSelection(plan.id)} style={styles.choiceHit}><View style={[styles.choice,{borderColor:getColorByTheme(theme,isDark,selected?.id===plan.id?'ink.primary':'line.hairline'),backgroundColor:getColorByTheme(theme,isDark,selected?.id===plan.id?'ink.primary':'bg.canvas'),borderRadius:theme.radius.pill}]}><Text style={{fontFamily:theme.typography.fontFamily['ui.medium'],fontSize:theme.typography.fontSize.link,color:getColorByTheme(theme,isDark,selected?.id===plan.id?'bg.canvas':'ink.secondary')}}>{plan.name||t('nativeAnalytics.unnamed')}</Text></View></Pressable>)}
          </ScrollView>
          <View style={[styles.choices,{backgroundColor:getColorByTheme(theme,isDark,'bg.raised'),borderRadius:12,padding:3,alignSelf:'flex-start'}]}><NativeProductButton compact variant="quiet" style={{borderWidth:0,borderRadius:9}} label={t('nativeAnalytics.monthly')} selected={period === 'monthly'} onPress={() => setPeriod('monthly')} /><NativeProductButton compact variant="quiet" style={{borderWidth:0,borderRadius:9}} label={t('nativeAnalytics.annual')} selected={period === 'annual'} onPress={() => setPeriod('annual')} /></View>
          <NativeProductCard><AnalyticsText kind="muted">{t('nativeAnalytics.currentPlan')}</AnalyticsText><AnalyticsText kind="title">{selected!.name || t('nativeAnalytics.unnamed')}</AnalyticsText>
            {(() => { const cost = recurringCost(money(BigInt(selected!.amountMinor), selected!.currency), selected!.cadence); return cost ? <View style={styles.delta}><AnalyticsMoney value={cost[period]}/><AnalyticsText kind="muted">{t(`nativeAnalytics.${period}`)}</AnalyticsText></View> : <AnalyticsText>{t('nativeAnalytics.customCycle')}</AnalyticsText>; })()}
          </NativeProductCard>
          <NativeProductHeading level="section" title={t('nativeAnalytics.sameCategory')} />
          <AnalyticsText kind="muted">{t('nativeAnalytics.comparisonLimit')}</AnalyticsText>
          {alternatives.some(plan=>plan.source==='synthetic-persona-fixture')?<AnalyticsText kind="muted">{t('nativeAnalytics.fixtureSource')}</AnalyticsText>:null}
          {alternatives.map(plan => {
            const difference = compareNativePlans(selected!, plan);
            const currentCost = recurringCost(money(BigInt(selected!.amountMinor), selected!.currency), selected!.cadence);
            const alternativeCost = recurringCost(money(BigInt(plan.amountMinor), plan.currency), plan.cadence);
            const delta = difference?.[period];
            return <NativeProductCard key={plan.id}><View style={styles.header}><View style={{flex:1,minWidth:0}}><AnalyticsText kind="title">{plan.name}</AnalyticsText></View><AnalyticsBadge label={t(plan.source === 'saved' ? 'nativeAnalytics.savedPlan' : 'nativeAnalytics.samplePrice')} /></View>
              {currentCost && alternativeCost ? <View style={styles.pair}>
                <AnalyticsPriceBox><AnalyticsText kind="label">{t('nativeAnalytics.currentPlan')}</AnalyticsText><AnalyticsMoney value={currentCost[period]} kind="price"/></AnalyticsPriceBox>
                <AnalyticsPriceBox positive={Boolean(delta&&delta.minorUnits>0n)}><AnalyticsText kind="label">{t('nativeAnalytics.alternative')}</AnalyticsText><AnalyticsMoney value={alternativeCost[period]} kind="price"/></AnalyticsPriceBox>
              </View> : <AnalyticsText kind="muted">{t('nativeAnalytics.customCycle')}</AnalyticsText>}
              {delta ? <View style={styles.delta}><AnalyticsMoney value={delta.minorUnits < 0n ? multiply(delta, -1n) : delta} /><AnalyticsText kind="muted">{t(delta.minorUnits > 0n ? 'nativeAnalytics.less' : delta.minorUnits < 0n ? 'nativeAnalytics.more' : 'nativeAnalytics.sameCost', { period: t(`nativeAnalytics.${period}`) })}</AnalyticsText></View> : null}
            </NativeProductCard>;
          })}
          {alternatives.length === 0 ? <NativeProductCard><AnalyticsText kind="muted">{t('nativeAnalytics.noAlternatives')}</AnalyticsText></NativeProductCard> : null}
        </>}
      </> : null}
      {state==='error'?<NativeProductButton compact label={t('actions.retry')} onPress={()=>{void reload();}}/>:null}
    </>}
  </ScrollView>{session.phase === 'active' ? <NativeProductNav active="insights" /> : null}</SafeAreaView>;
}
const styles = StyleSheet.create({ content: { paddingHorizontal:20,paddingTop:18,paddingBottom:32,gap:10 },choiceHit:{minHeight:44,justifyContent:'center'},choice:{minHeight:34,paddingHorizontal:14,paddingVertical:6,borderWidth:1,justifyContent:'center'}, choices: { flexDirection:'row',gap:6 }, header: { flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10 }, pair: { flexDirection:'row',flexWrap:'wrap',gap:6 }, delta: {flexDirection:'row',alignItems:'baseline',flexWrap:'wrap',gap:6} });
