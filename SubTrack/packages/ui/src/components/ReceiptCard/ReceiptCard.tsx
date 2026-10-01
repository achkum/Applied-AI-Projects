import React from 'react';
import { formatMoney } from '../../utils/formatMoney';
import styles from './ReceiptCard.module.css';

export interface PricePoint {
  date: string;
  amountMinor: number;
}

export interface ReceiptCardProps {
  name: string;
  category: string;
  amountMinor: number;
  currency: string;
  locale: 'sv-SE' | 'en-SE';
  cadenceLabel: string;
  priceHistory?: PricePoint[];
  priceHistoryLabel?: string;
}

const SPARKLINE_WIDTH = 120;
const SPARKLINE_HEIGHT = 24;

function buildSparklinePath(points: PricePoint[]): string {
  if (points.length < 2) return '';
  const min = Math.min(...points.map((p) => p.amountMinor));
  const max = Math.max(...points.map((p) => p.amountMinor));
  const range = max - min || 1;
  const xs = points.map((_, i) => (i / (points.length - 1)) * SPARKLINE_WIDTH);
  const ys = points.map((p) => SPARKLINE_HEIGHT - ((p.amountMinor - min) / range) * (SPARKLINE_HEIGHT - 4) - 2);
  return xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i]!.toFixed(1)}`).join(' ');
}

function isPriceIncrease(history: PricePoint[]): boolean {
  if (history.length < 2) return false;
  const last = history[history.length - 1]!;
  const prev = history[history.length - 2]!;
  return last.amountMinor > prev.amountMinor;
}

export function ReceiptCard({
  name,
  category,
  amountMinor,
  currency,
  locale,
  cadenceLabel,
  priceHistory,
  priceHistoryLabel = 'Price history',
}: ReceiptCardProps) {
  const formatted = formatMoney(amountMinor, currency, locale);
  const hasHistory = priceHistory != null && priceHistory.length >= 2;
  const isIncrease = hasHistory && isPriceIncrease(priceHistory!);
  const sparkPath = hasHistory ? buildSparklinePath(priceHistory!) : '';
  const categoryVar = `--category-${category}`;

  return (
    <article
      className={styles.root}
      style={{ borderTopColor: `var(${categoryVar})` } as React.CSSProperties}
    >
      <header className={styles.header}>
        <span
          className={styles.categoryDot}
          aria-hidden="true"
          style={{ background: `var(${categoryVar})` }}
        />
        <h2 className={styles.name}>{name}</h2>
      </header>

      <div className={styles.priceRow}>
        <span
          className={styles.price}
          style={isIncrease ? { color: 'var(--ember-amber)' } : undefined}
        >
          {formatted}
        </span>
        <span className={styles.cadence}>{cadenceLabel}</span>
      </div>

      {hasHistory && (
        <div className={styles.sparklineWrapper}>
          <svg
            width={SPARKLINE_WIDTH}
            height={SPARKLINE_HEIGHT}
            viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
            aria-hidden="true"
            className={styles.sparkline}
            style={isIncrease ? { stroke: 'var(--ember-amber)' } : undefined}
          >
            <path d={sparkPath} fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <details className={styles.historyDetails}>
            <summary className={styles.historySummary}>{priceHistoryLabel}</summary>
            <ul className={styles.historyList}>
              {priceHistory!.map((p) => (
                <li key={p.date}>
                  {p.date}: {formatMoney(p.amountMinor, currency, locale)}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}

      <div className={styles.perforation} aria-hidden="true" />
    </article>
  );
}
