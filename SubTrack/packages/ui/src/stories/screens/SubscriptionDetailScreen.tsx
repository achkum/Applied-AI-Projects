import React from 'react';
import { ReceiptCard } from '../../components/ReceiptCard/ReceiptCard.js';
import type { PricePoint } from '../../components/ReceiptCard/ReceiptCard.js';
import styles from './SubscriptionDetailScreen.module.css';

export interface SubscriptionDetailScreenProps {
  name: string;
  category: string;
  amountMinor: number;
  currency: string;
  locale: 'sv-SE' | 'en-SE';
  cadenceLabel: string;
  priceHistory?: PricePoint[];
  priceHistoryLabel?: string;
  backLabel?: string;
}

export function SubscriptionDetailScreen({
  name,
  category,
  amountMinor,
  currency,
  locale,
  cadenceLabel,
  priceHistory,
  priceHistoryLabel,
  backLabel = 'Back',
}: SubscriptionDetailScreenProps) {
  return (
    <div className={styles.root}>
      <nav className={styles.navBar}>
        <button type="button" className={styles.backBtn} aria-label={backLabel}>
          {backLabel}
        </button>
      </nav>
      <div className={styles.content}>
        <div className={styles.cardWrap}>
          <ReceiptCard
            name={name}
            category={category}
            amountMinor={amountMinor}
            currency={currency}
            locale={locale}
            cadenceLabel={cadenceLabel}
            priceHistory={priceHistory}
            priceHistoryLabel={priceHistoryLabel}
          />
        </div>
      </div>
    </div>
  );
}
