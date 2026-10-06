'use client';

import { useState } from 'react';
import { catalogs, type Locale } from '@subtrack/i18n';
import { Orbit, RollingNumber, ScopeSwitcher } from '@subtrack/ui';
import { HOME_MOCK_SUBSCRIPTIONS, HOME_MOCK_TOTALS, homeMockPresentation } from '@/lib/home-mock';
import styles from './home-screen.module.css';

const ME_IDS = ['netflix', 'spotify', 'gh'];
const HOUSEHOLD_IDS = [...ME_IDS, 'icloud', 'hbo'];

export function HomeScreen({ locale }: { locale: Locale }) {
  const [scopeIndex, setScopeIndex] = useState(0);
  const [period, setPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [activeId, setActiveId] = useState('netflix');
  const ids = scopeIndex === 0 ? ME_IDS : HOUSEHOLD_IDS;
  const subscriptions = HOME_MOCK_SUBSCRIPTIONS.filter(({ id }) => ids.includes(id));
  const presentationById = Object.fromEntries(
    Object.entries(homeMockPresentation(locale)).filter(([id]) => ids.includes(id)),
  );
  const catalog = catalogs[locale];
  const totals = scopeIndex === 0 ? HOME_MOCK_TOTALS.me : HOME_MOCK_TOTALS.household;
  const total = totals[period === 'monthly' ? 'monthly' : 'projection'];
  const effectiveActiveId = ids.includes(activeId) ? activeId : undefined;

  return (
    <main className={styles.frame}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>{catalog.navigation.home}</p>
        <h1 className={styles.title}>{catalog.home.totalHeading}</h1>
        <ScopeSwitcher
          ariaLabel={catalog.scopeSwitcher.groupLabel}
          options={[
            { kind: 'me', label: catalog.scope.personal },
            { kind: 'household', label: catalog.navigation.household },
          ]}
          selectedIndex={scopeIndex}
          onSelect={setScopeIndex}
        />
      </header>
      <section aria-label={catalog.home.totalHeading} className={styles.total}>
        <RollingNumber
          amountMinor={total}
          currency="SEK"
          locale={locale === 'sv' ? 'sv-SE' : 'en-SE'}
          period={period}
          onPeriodChange={setPeriod}
          monthlyLabel={catalog.orbit.billingCadence.MONTHLY}
          annualLabel={catalog.orbit.billingCadence.ANNUAL}
          periodGroupLabel={catalog.rollingTotal.periodGroupLabel}
        />
        <p className={styles.totalCaption}>
          {period === 'monthly' ? catalog.orbit.monthlyEquivalent : catalog.home.projection12Months}
        </p>
      </section>
      <div className={styles.disclosures}>
        <p>{catalog.home.sampleCaption}</p>
        <p>{catalog.home.scopeDisclosure}</p>
      </div>
      <div className={styles.orbit}>
        <Orbit
          activeId={effectiveActiveId}
          ariaLabel={catalog.orbit.ariaLabel}
          locale={locale}
          onBodySelect={setActiveId}
          presentationById={presentationById}
          subscriptions={subscriptions}
        />
      </div>
    </main>
  );
}
