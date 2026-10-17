import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useNativeSession } from '@/state/NativeSession';
import type { NativeFeatureSession } from '../onboarding/NativePersonalScreen';
import { useI18n } from '@/context/I18nContext';
import { useTheme } from '@/context/ThemeContext';
import { getColorByTheme } from '@/utils/colors';
import * as privateApi from '@/api/privateMobileApi';
import { createNativeAnalyticsReader, type NativeAnalyticsReader } from '@/api/nativeAnalyticsReader';
import { compareNativePlans } from '@/api/nativeAnalyticsProjection';
import { recurringCost } from '../../../../../packages/money/src/recurring-cost';
import { money, multiply } from '../../../../../packages/money/src/money';
import { NativeProductBadge, NativeProductButton, NativeProductCard, NativeProductHeading } from '../billing/NativeProductUI';
import { AnalyticsBar, AnalyticsLink, AnalyticsMoney, AnalyticsPriceBox, AnalyticsText } from './NativeAnalyticsUI';
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
  const alternatives = selected ? value?.plans.filter(row => row.id !== selected.id && row.categoryCode === selected.categoryCode && row.currency === selected.currency) ?? [] : [];
  return <SafeAreaView style={{ flex: 1, backgroundColor: getColorByTheme(theme, isDark, 'bg.canvas') }}><ScrollView contentContainerStyle={styles.content}>
    <AnalyticsLink label={t('nativeAnalytics.backToInsights')} onPress={() => router.replace('/personal-insights')} />
    <NativeProductHeading title={t('nativeAnalytics.comparisons')} />
    {session.phase !== 'active' ? inactiveContent ?? <AnalyticsText>{t('nativeAnalytics.loginRequired')}</AnalyticsText> : <>
      {state === 'loading' ? <AnalyticsText kind="muted">{t('nativeAnalytics.loading')}</AnalyticsText> : null}
      {state === 'error' ? <AnalyticsText>{t('nativeAnalytics.unavailable')}</AnalyticsText> : null}
      {state === 'setup-required' ? <NativeProductButton label={t('nativeAnalytics.finishSetup')} onPress={() => router.replace('/personal')} /> : null}
      {value && state === 'ready' ? <>
        {saved.length === 0 ? <NativeProductCard><AnalyticsText>{t('nativeAnalytics.empty')}</AnalyticsText><NativeProductButton label={t('nativeAnalytics.openSubscriptions')} onPress={() => router.replace('/personal')} /></NativeProductCard> : <>
          <AnalyticsText kind="title">{t('nativeAnalytics.yourPlans')}</AnalyticsText>
          <ScrollView horizontal contentContainerStyle={styles.choices} showsHorizontalScrollIndicator={false}>
            {saved.map(plan => <NativeProductButton key={plan.id} testID={`native-comparison-select-${plan.subscriptionId}`} label={plan.name || t('nativeAnalytics.unnamed')} selected={selected?.id === plan.id} onPress={() => setSelection(plan.id)} />)}
          </ScrollView>
          <View style={styles.choices}><NativeProductButton label={t('nativeAnalytics.monthly')} selected={period === 'monthly'} onPress={() => setPeriod('monthly')} /><NativeProductButton label={t('nativeAnalytics.annual')} selected={period === 'annual'} onPress={() => setPeriod('annual')} /></View>
          <NativeProductCard><AnalyticsText kind="muted">{t('nativeAnalytics.currentPlan')}</AnalyticsText><AnalyticsText kind="title">{selected!.name || t('nativeAnalytics.unnamed')}</AnalyticsText>
            {(() => { const cost = recurringCost(money(BigInt(selected!.amountMinor), selected!.currency), selected!.cadence); return cost ? <AnalyticsMoney value={cost[period]} /> : <AnalyticsText>{t('nativeAnalytics.customCycle')}</AnalyticsText>; })()}
            <AnalyticsText kind="muted">{t('nativeAnalytics.estimate')}</AnalyticsText>
          </NativeProductCard>
          <NativeProductHeading title={t('nativeAnalytics.sameCategory')} />
          <AnalyticsText kind="muted">{t('nativeAnalytics.comparisonLimit')}</AnalyticsText>
          {alternatives.map(plan => {
            const difference = compareNativePlans(selected!, plan);
            const currentCost = recurringCost(money(BigInt(selected!.amountMinor), selected!.currency), selected!.cadence);
            const alternativeCost = recurringCost(money(BigInt(plan.amountMinor), plan.currency), plan.cadence);
            const maximum = currentCost && alternativeCost ? currentCost[period].minorUnits >= alternativeCost[period].minorUnits ? currentCost[period] : alternativeCost[period] : null;
            const delta = difference?.[period];
            return <NativeProductCard key={plan.id}><View style={styles.header}><AnalyticsText kind="title">{plan.name}</AnalyticsText><NativeProductBadge label={t(plan.source === 'saved' ? 'nativeAnalytics.savedPlan' : 'nativeAnalytics.samplePrice')} /></View>
              {currentCost && alternativeCost && maximum ? <View style={styles.pair}>
                <AnalyticsPriceBox><AnalyticsText kind="muted">{t('nativeAnalytics.youPay')}</AnalyticsText><AnalyticsMoney value={currentCost[period]} /><AnalyticsBar value={currentCost[period]} maximum={maximum} /></AnalyticsPriceBox>
                <AnalyticsPriceBox><AnalyticsText kind="muted">{t('nativeAnalytics.alternative')}</AnalyticsText><AnalyticsMoney value={alternativeCost[period]} /><AnalyticsBar value={alternativeCost[period]} maximum={maximum} /></AnalyticsPriceBox>
              </View> : <AnalyticsText kind="muted">{t('nativeAnalytics.customCycle')}</AnalyticsText>}
              {delta ? <View style={styles.delta}><AnalyticsMoney value={delta.minorUnits < 0n ? multiply(delta, -1n) : delta} /><AnalyticsText kind="muted">{t(delta.minorUnits > 0n ? 'nativeAnalytics.less' : delta.minorUnits < 0n ? 'nativeAnalytics.more' : 'nativeAnalytics.sameCost', { period: t(`nativeAnalytics.${period}`) })}</AnalyticsText></View> : null}
              {plan.source === 'synthetic-persona-fixture' ? <AnalyticsText kind="muted">{t('nativeAnalytics.fixtureSource')}</AnalyticsText> : null}
            </NativeProductCard>;
          })}
          {alternatives.length === 0 ? <NativeProductCard><AnalyticsText kind="muted">{t('nativeAnalytics.noAlternatives')}</AnalyticsText></NativeProductCard> : null}
        </>}
      </> : null}
      <NativeProductButton label={t('nativeAnalytics.refresh')} disabled={state === 'loading'} onPress={() => { void reload(); }} />
    </>}
  </ScrollView>{session.phase === 'active' ? <NativeProductNav active="insights" /> : null}</SafeAreaView>;
}
const styles = StyleSheet.create({ content: { padding: 24, paddingBottom: 32, gap: 16 }, choices: { flexDirection: 'row', gap: 8 }, header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, pair: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, delta: { gap: 6 } });
