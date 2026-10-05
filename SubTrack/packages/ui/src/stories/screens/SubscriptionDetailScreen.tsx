import type { Catalog, Locale } from '@subtrack/i18n';
import { catalogs } from '@subtrack/i18n';
import { ReceiptCard } from '../../components/ReceiptCard/ReceiptCard';
import type { PricePoint } from '../../components/ReceiptCard/ReceiptCard';
import styles from './SubscriptionDetailScreen.module.css';

type CopyKey =
  | 'hero.subscriptionDetail.title'
  | 'hero.subscriptionDetail.cadenceMonthly'
  | 'hero.subscriptionDetail.priceHistory';

const copyReaders: Record<CopyKey, (catalog: Catalog) => string> = {
  'hero.subscriptionDetail.title': (catalog) => catalog.hero.subscriptionDetail.title,
  'hero.subscriptionDetail.cadenceMonthly': (catalog) => catalog.hero.subscriptionDetail.cadenceMonthly,
  'hero.subscriptionDetail.priceHistory': (catalog) => catalog.hero.subscriptionDetail.priceHistory,
};

function t(locale: Locale, key: CopyKey): string {
  return copyReaders[key](catalogs[locale]);
}

const priceHistory: PricePoint[] = [
  { date: '2024-09', amountMinor: 9900 },
  { date: '2024-12', amountMinor: 9900 },
  { date: '2025-03', amountMinor: 9900 },
  { date: '2025-06', amountMinor: 10900 },
  { date: '2025-09', amountMinor: 10900 },
];

export interface SubscriptionDetailScreenProps {
  locale: Locale;
}

export function SubscriptionDetailScreen({ locale }: SubscriptionDetailScreenProps) {
  const moneyLocale = locale === 'sv' ? 'sv-SE' : 'en-SE';

  return (
    <main className={styles.frame} data-story="screens-subscription-detail">
      <section aria-labelledby="subscription-detail-title" className={styles.detail}>
        <h1 className={styles.title} id="subscription-detail-title">
          {t(locale, 'hero.subscriptionDetail.title')}
        </h1>
        <ReceiptCard
          name="Spotify"
          category="music-audio"
          amountMinor={10900}
          currency="SEK"
          locale={moneyLocale}
          cadenceLabel={t(locale, 'hero.subscriptionDetail.cadenceMonthly')}
          priceHistory={priceHistory}
          priceHistoryLabel={t(locale, 'hero.subscriptionDetail.priceHistory')}
        />
      </section>
    </main>
  );
}
