import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { useTheme } from '@/context/ThemeContext';
import { useI18n } from '@/context/I18nContext';
import { getColorByTheme } from '@/utils/colors';
import { formatMoney } from '@/utils/formatMoney';
import { oklchToRgb } from '@/utils/oklch';
import { PriceHistoryPoint, ReceiptCardProps } from './types';

const SPARKLINE_WIDTH = 120;
const SPARKLINE_HEIGHT = 32;

function sparklinePoints(history: PriceHistoryPoint[]): string {
  if (history.length < 2) return '';
  const amounts = history.map((point) => point.amountMinorUnits);
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  const range = max - min || 1;
  return history
    .map((point, index) => {
      const x = (index / (history.length - 1)) * SPARKLINE_WIDTH;
      const y =
        SPARKLINE_HEIGHT -
        ((point.amountMinorUnits - min) / range) * SPARKLINE_HEIGHT;
      return `${x},${y}`;
    })
    .join(' ');
}

/**
 * Editorial subscription-detail header with price history sparkline.
 * See docs/design/components/receipt-card.md.
 */
export function ReceiptCard({
  subscriptionName,
  categoryCode,
  currentPriceMinorUnits,
  currencyCode,
  cadence,
  priceHistory,
  isUnavailable = false,
}: ReceiptCardProps) {
  const { theme, isDark } = useTheme();
  const { t, locale } = useI18n();
  const color = (key: string) => getColorByTheme(theme, isDark, key);

  const categoryHueToken = theme.categoryHue[categoryCode]?.[isDark ? 'dark' : 'light'];
  const categoryColor = categoryHueToken ? oklchToRgb(categoryHueToken) : color('ink.secondary');

  const priceLabel =
    isUnavailable || currentPriceMinorUnits === null
      ? t('receiptCard.unavailable')
      : formatMoney(currentPriceMinorUnits, currencyCode, locale);

  const latestPoint = priceHistory[priceHistory.length - 1];
  const previousPoint = priceHistory[priceHistory.length - 2];
  const isIncrease =
    priceHistory.length >= 2 &&
    !!latestPoint &&
    !!previousPoint &&
    latestPoint.amountMinorUnits > previousPoint.amountMinorUnits;

  const historySummary = priceHistory
    .map((point) => `${point.date}: ${formatMoney(point.amountMinorUnits, currencyCode, locale)}`)
    .join('; ');

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: color('bg.raised'),
          borderRadius: theme.radius.card,
        },
      ]}
    >
      <View style={styles.header}>
        <View
          style={[styles.categoryMarker, { backgroundColor: categoryColor }]}
          accessible
          accessibilityLabel={t('receiptCard.category')}
        />
        <Text
          style={{ color: color('ink.primary'), fontFamily: theme.typography.fontFamily.ui }}
        >
          {subscriptionName}
        </Text>
      </View>

      <Text
        style={[
          styles.price,
          {
            color: isIncrease ? color('ember.amber') : color('ink.primary'),
            fontFamily: theme.typography.fontFamily.display,
            fontSize: theme.typography.fontSize['3xl'],
          },
        ]}
        accessibilityLabel={
          isIncrease
            ? t('receiptCard.priceIncrease', { amount: priceLabel })
            : priceLabel
        }
      >
        {priceLabel}
      </Text>

      <Text style={{ color: color('ink.secondary'), fontFamily: theme.typography.fontFamily.ui }}>
        {t(`receiptCard.cadence.${cadence}`)}
      </Text>

      {priceHistory.length >= 2 ? (
        <View
          accessible
          accessibilityLabel={`${t('receiptCard.priceHistory')}: ${historySummary}`}
        >
          <Svg width={SPARKLINE_WIDTH} height={SPARKLINE_HEIGHT}>
            <Polyline
              points={sparklinePoints(priceHistory)}
              fill="none"
              stroke={color('ink.secondary')}
              strokeWidth={1.5}
            />
          </Svg>
        </View>
      ) : (
        <Text style={{ color: color('ink.secondary') }}>{t('receiptCard.noHistory')}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryMarker: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  price: {
    fontVariant: ['tabular-nums'],
  },
});
