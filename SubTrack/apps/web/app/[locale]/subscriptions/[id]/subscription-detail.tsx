'use client';

import { catalogs, type Locale } from '@subtrack/i18n';
import { ReceiptCard, type PricePoint } from '@subtrack/ui';
import styles from './subscription-detail.module.css';

const history: PricePoint[] = [
  { date: '2024-09', amountMinor: 9900 },
  { date: '2024-12', amountMinor: 9900 },
  { date: '2025-03', amountMinor: 9900 },
  { date: '2025-06', amountMinor: 10900 },
  { date: '2025-09', amountMinor: 10900 },
];

export function SubscriptionDetail({ locale }: { locale: Locale }) {
  const copy = catalogs[locale];
  return (
    <main className={styles.frame}>
      <section aria-labelledby="subscription-detail-title" className={styles.detail}>
        <h1 className={styles.title} id="subscription-detail-title">
          {copy.hero.subscriptionDetail.title}
        </h1>
        <ReceiptCard
          name="Spotify"
          category="music-audio"
          amountMinor={10900}
          currency="SEK"
          locale={locale === 'sv' ? 'sv-SE' : 'en-SE'}
          cadenceLabel={copy.hero.subscriptionDetail.cadenceMonthly}
          priceHistory={history}
          priceHistoryLabel={copy.hero.subscriptionDetail.priceHistory}
        />
        <p className={styles.disclosure}>{copy.home.sampleCaption}</p>
      </section>
    </main>
  );
}
