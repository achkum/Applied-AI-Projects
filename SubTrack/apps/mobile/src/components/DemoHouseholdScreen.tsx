import React from 'react';
import { SafeAreaView, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import demoFixture from '@subtrack/i18n/catalogs/demo-fixture';
import enCatalog from '@subtrack/i18n/catalogs/en';
import svCatalog from '@subtrack/i18n/catalogs/sv';
import { useI18n } from '@/context/I18nContext';
import { useTheme } from '@/context/ThemeContext';

type CopyKey =
  | 'mobileDemo.banner'
  | 'mobileDemo.description'
  | 'mobileDemo.unavailable'
  | 'mobileDemo.return'
  | 'mobileDemo.monthly'
  | 'mobileDemo.annual';
type Locale = 'en' | 'sv';
type DemoFixture = typeof demoFixture;
const catalogs = { en: enCatalog, sv: svCatalog };

function catalogText(locale: Locale, key: CopyKey): string {
  let value: unknown = catalogs[locale];
  for (const part of key.split('.')) {
    value = (value as Record<string, unknown>)[part];
  }
  if (typeof value !== 'string') throw new Error(`Missing demo translation: ${key}`);
  return value;
}

export function DemoHouseholdScreen({
  locale,
  fixture = demoFixture,
}: {
  locale: Locale;
  fixture?: DemoFixture;
}) {
  const router = useRouter();
  const { locale: providerLocale, t } = useI18n();
  const { theme, isDark } = useTheme();
  const palette = isDark ? theme.color.dark : theme.color.light;
  const copy = (key: CopyKey) => providerLocale === locale
    ? t(key)
    : catalogText(locale, key);
  const subscriptions = fixture.subscriptions.length === demoFixture.subscriptions.length && fixture.subscriptions.every((subscription) =>
    typeof subscription.displayAmount?.[locale] === 'string'
      && subscription.displayAmount[locale].length > 0
      && typeof subscription.merchantName === 'string'
      && subscription.merchantName.length > 0
      && (subscription.billingCadence === 'MONTHLY' || subscription.billingCadence === 'ANNUAL'),
  ) ? fixture.subscriptions : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette['bg.canvas'] }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <Text style={{ color: palette['ink.primary'], fontFamily: theme.typography.fontFamily.display, fontSize: theme.typography.fontSize.xl }}>
          SubTrack
        </Text>
        <View
          accessibilityRole="alert"
          style={{ padding: 16, borderRadius: theme.radius.card, backgroundColor: palette['aurora.violet'] }}
        >
          <Text style={{ color: isDark ? palette['bg.canvas'] : palette['bg.raised'], fontFamily: theme.typography.fontFamily.ui, fontSize: theme.typography.fontSize.md, fontWeight: '700' }}>
            {copy('mobileDemo.banner')}
          </Text>
        </View>

        <Text accessibilityRole="header" style={{ color: palette['ink.primary'], fontFamily: theme.typography.fontFamily.display, fontSize: theme.typography.fontSize['2xl'] }}>
          {fixture.householdName}
        </Text>
        <Text style={{ color: palette['ink.secondary'], fontFamily: theme.typography.fontFamily.ui, fontSize: theme.typography.fontSize.md }}>
          {copy('mobileDemo.description')}
        </Text>

        {subscriptions === null ? (
          <Text accessibilityRole="alert" style={{ padding: 16, color: palette['ink.primary'], backgroundColor: palette['bg.raised'], borderRadius: theme.radius.card, fontSize: theme.typography.fontSize.md }}>
            {copy('mobileDemo.unavailable')}
          </Text>
        ) : (
          <View>
            {subscriptions.map((subscription) => {
              const amount = subscription.displayAmount[locale];
              const cadenceKey = subscription.billingCadence === 'MONTHLY' ? 'mobileDemo.monthly' : 'mobileDemo.annual';
              return (
                <View
                  key={subscription.id}
                  accessible
                  accessibilityLabel={`${subscription.merchantName}, ${amount}, ${copy(cadenceKey)}`}
                  style={{ paddingVertical: 14, gap: 8, borderBottomWidth: 1, borderBottomColor: palette['bg.sunken'] }}
                >
                  <Text style={{ color: palette['ink.primary'], fontFamily: theme.typography.fontFamily.ui, fontSize: theme.typography.fontSize.md, fontWeight: '600' }}>
                    {subscription.merchantName}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 8 }}>
                    <Text style={{ color: palette['ink.primary'], fontFamily: theme.typography.fontFamily.display, fontSize: theme.typography.fontSize.lg, fontVariant: ['tabular-nums'] }}>
                      {amount}
                    </Text>
                    <Text style={{ color: palette['ink.secondary'], fontFamily: theme.typography.fontFamily.ui, fontSize: theme.typography.fontSize.md }}>
                      {copy(cadenceKey)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={copy('mobileDemo.return')}
          onPress={() => router.replace(`/${locale}`)}
          activeOpacity={0.72}
          style={{ minHeight: 48, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center', backgroundColor: palette['bg.sunken'], borderRadius: theme.radius.pill }}
        >
          <Text style={{ color: palette['ink.primary'], fontSize: theme.typography.fontSize.md, fontWeight: '600' }}>
            {copy('mobileDemo.return')}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
