import { useState } from 'react';
import type { Locale } from '@subtrack/i18n';
import { catalogs } from '@subtrack/i18n';
import { ScopeSwitcher } from '../../components/ScopeSwitcher/ScopeSwitcher';
import { Orbit } from '../../components/Orbit/Orbit';
import { RollingNumber } from '../../components/RollingNumber/RollingNumber';
import { SAMPLE_SUBS } from '../fixtures/orbitSubscriptions';
import { buildPresentationById } from '../../components/Orbit/Orbit.stories';
import styles from './HomeScreen.module.css';

const ME_IDS = ['netflix', 'spotify', 'gh'];
const HOUSEHOLD_IDS = [...ME_IDS, 'icloud', 'hbo'];
// The household is a fully-visible visual mock only; access and sharing are not modeled here.
const TOTALS = [
  { monthly: 32600, projection: 391200 },
  { monthly: 47400, projection: 568800 },
] as const;

export interface HomeScreenProps {
  locale: Locale;
}

export function HomeScreen({ locale }: HomeScreenProps) {
  const [scopeIndex, setScopeIndex] = useState(0);
  const [period, setPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [activeId, setActiveId] = useState('netflix');
  const ids = scopeIndex === 0 ? ME_IDS : HOUSEHOLD_IDS;
  const subscriptions = SAMPLE_SUBS.filter(({ id }) => ids.includes(id));
  const allPresentations = buildPresentationById(locale);
  const presentationById = Object.fromEntries(
    Object.entries(allPresentations).filter(([id]) => ids.includes(id)),
  );
  const selectedId = subscriptions.some(({ id }) => id === activeId) ? activeId : undefined;
  const catalog = catalogs[locale];
  const scopeTotals = scopeIndex === 0 ? TOTALS[0] : TOTALS[1];
  const total = scopeTotals[period === 'monthly' ? 'monthly' : 'projection'];

  return (
    <main className={styles.frame} data-story="screens-home">
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
      <p className={styles.disclosure}>{catalog.home.sampleCaption}</p>
      <div className={styles.orbit}>
        <Orbit
          activeId={selectedId}
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
