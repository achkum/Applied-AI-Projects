import React, { useState } from 'react';
import { Orbit } from '../../components/Orbit/Orbit.js';
import { ScopeSwitcher } from '../../components/ScopeSwitcher/ScopeSwitcher.js';
import type { ScopeOption } from '../../components/ScopeSwitcher/ScopeSwitcher.js';
import { RollingNumber } from '../../components/RollingNumber/RollingNumber.js';
import type { OrbitSubscription } from '../../components/Orbit/types.js';
import styles from './HomeScreen.module.css';

export interface HomeScreenProps {
  subscriptions: OrbitSubscription[];
  scopes: ScopeOption[];
  amountMinor: number;
  currency: string;
  locale: 'sv-SE' | 'en-SE';
  monthlyLabel: string;
  annualLabel: string;
}

export function HomeScreen({
  subscriptions,
  scopes,
  amountMinor,
  currency,
  locale,
  monthlyLabel,
  annualLabel,
}: HomeScreenProps) {
  const [selectedScope, setSelectedScope] = useState(0);
  const [period, setPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [activeId, setActiveId] = useState<string | undefined>();

  const displayAmount = period === 'annual' ? amountMinor * 12 : amountMinor;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <ScopeSwitcher
          options={scopes}
          selectedIndex={selectedScope}
          onSelect={setSelectedScope}
        />
      </div>

      <div className={styles.orbitWrap}>
        <Orbit
          subscriptions={subscriptions}
          activeId={activeId}
          onBodySelect={setActiveId}
          ariaLabel="Your subscription orbit"
        />
      </div>

      <div className={styles.footer}>
        <RollingNumber
          amountMinor={displayAmount}
          currency={currency}
          locale={locale}
          period={period}
          onPeriodChange={setPeriod}
          monthlyLabel={monthlyLabel}
          annualLabel={annualLabel}
        />
      </div>
    </div>
  );
}
