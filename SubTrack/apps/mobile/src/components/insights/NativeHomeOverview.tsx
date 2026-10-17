import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { NativeFeatureSession } from '../onboarding/NativePersonalScreen';
import type { NativeAnalyticsReader } from '@/api/nativeAnalyticsReader';
import { useI18n } from '@/context/I18nContext';
import { useTheme } from '@/context/ThemeContext';
import { getColorByTheme } from '@/utils/colors';
import { NativeProductButton, NativeProductCard } from '../billing/NativeProductUI';
import { useNativeAnalytics } from './useNativeAnalytics';
import { AnalyticsBar, AnalyticsLink, AnalyticsMoney, AnalyticsPriceBox, AnalyticsText } from './NativeAnalyticsUI';
const clock = () => new Date();

/** The same authorized projection as Insights. No new backend authority or fixture totals. */
export function NativeHomeOverview({ session, reader, now = clock, children }: { session: NativeFeatureSession; reader: NativeAnalyticsReader; now?: () => Date; children?: React.ReactNode }) {
  const { value, state, reload } = useNativeAnalytics(session, reader, now), { t, locale } = useI18n(), router = useRouter(), { theme, isDark } = useTheme();
  const [period, setPeriod] = useState<'monthly' | 'annual'>('monthly');
  if (session.phase !== 'active') return null;
  if (state === 'loading') return <AnalyticsText kind="muted">{t('nativeAnalytics.loading')}</AnalyticsText>;
  if (state === 'error') return <NativeProductCard><AnalyticsText kind="muted">{t('nativeAnalytics.unavailable')}</AnalyticsText><NativeProductButton label={t('nativeAnalytics.refresh')} onPress={() => { void reload(); }} /></NativeProductCard>;
  if (!value) return null;
  const findings = value.priceIncreases.length + value.overlaps.length;
  const increase = value.priceIncreases[0];
  const increasedPlan = increase ? value.active.find(row => row.id === increase.subscriptionId) : null;
  return <View testID="native-home-overview" style={styles.stack}>
    {value.profile ? <View style={styles.summary}><AnalyticsText kind="muted">{now().toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })}</AnalyticsText><Pressable accessibilityRole="button" accessibilityLabel={t('onboarding.productNav.profile')} onPress={() => router.push('/personal-profile')} style={[styles.avatar, { backgroundColor: getColorByTheme(theme, isDark, 'bg.raised'), borderColor: getColorByTheme(theme, isDark, 'line.hairline') }]}><AnalyticsText kind="title">{value.profile.avatarEmoji ?? value.profile.displayName?.trim().slice(0, 1).toLocaleUpperCase(locale) ?? '·'}</AnalyticsText></Pressable></View> : null}
    {value.totals.map(row => <View key={row.monthly.currency} style={styles.total}><AnalyticsMoney value={row[period]} kind="hero" /><AnalyticsText kind="muted">{t(period === 'monthly' ? 'nativeAnalytics.perMonth' : 'nativeAnalytics.perYear')}</AnalyticsText></View>)}
    <View style={styles.summary}><AnalyticsText kind="muted">{t('nativeAnalytics.activePlans', { count: value.active.length })}</AnalyticsText>{value.totals.length > 0 ? <AnalyticsLink label={t(period === 'monthly' ? 'nativeAnalytics.annual' : 'nativeAnalytics.monthly')} onPress={() => setPeriod(period === 'monthly' ? 'annual' : 'monthly')} /> : null}</View>
    {value.active.length === 0 ? <NativeProductCard><AnalyticsText>{t('nativeAnalytics.empty')}</AnalyticsText><NativeProductButton label={t('nativeAnalytics.connectBank')} variant="primary" onPress={() => router.push('/personal-bank')} /><NativeProductButton label={t('nativeAnalytics.addManually')} onPress={() => router.push('/personal')} /></NativeProductCard> : null}
    {children}
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
const styles = StyleSheet.create({ stack: { gap: 16 }, avatar: { width: 44, minHeight: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, total: { gap: 4, alignItems: 'flex-end' }, summary: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, pair: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, tiles: { gap: 12 }, tile: { width: 150, minHeight: 104, justifyContent: 'space-between' }, actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 16 } });
