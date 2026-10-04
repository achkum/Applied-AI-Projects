import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ReceiptCard } from './ReceiptCard';

jest.mock('@/context/ThemeContext', () => ({
  useTheme: () =>
    jest
      .requireActual<typeof import('./testUtils/contextMocks')>('./testUtils/contextMocks')
      .makeTheme(),
}));
jest.mock('@/context/I18nContext', () => ({
  useI18n: () =>
    jest
      .requireActual<typeof import('./testUtils/contextMocks')>('./testUtils/contextMocks')
      .makeI18n('en'),
}));

describe('ReceiptCard', () => {
  it('renders the locale-formatted current price', () => {
    render(
      <ReceiptCard
        subscriptionName="Netflix"
        categoryCode="VIDEO_STREAMING"
        currentPriceMinorUnits={139000}
        currencyCode="SEK"
        cadence="monthly"
        priceHistory={[]}
      />,
    );
    expect(screen.getByText('SEK 1,390')).toBeTruthy();
  });

  it('shows an unavailable label instead of an invented amount', () => {
    render(
      <ReceiptCard
        subscriptionName="Netflix"
        categoryCode="VIDEO_STREAMING"
        currentPriceMinorUnits={null}
        currencyCode="SEK"
        cadence="monthly"
        priceHistory={[]}
        isUnavailable
      />,
    );
    expect(screen.getByText('Price unavailable')).toBeTruthy();
  });

  it('omits the sparkline and shows a no-history message when history has fewer than 2 points', () => {
    render(
      <ReceiptCard
        subscriptionName="Netflix"
        categoryCode="VIDEO_STREAMING"
        currentPriceMinorUnits={139000}
        currencyCode="SEK"
        cadence="monthly"
        priceHistory={[]}
      />,
    );
    expect(screen.getByText('No price history yet')).toBeTruthy();
  });

  it('renders an accessible text-equivalent summary alongside the sparkline', () => {
    render(
      <ReceiptCard
        subscriptionName="Netflix"
        categoryCode="VIDEO_STREAMING"
        currentPriceMinorUnits={139000}
        currencyCode="SEK"
        cadence="monthly"
        priceHistory={[
          { date: '2026-01-01', amountMinorUnits: 129000 },
          { date: '2026-06-01', amountMinorUnits: 139000 },
        ]}
      />,
    );
    expect(
      screen.getByLabelText(/Price history: 2026-01-01: SEK 1,290; 2026-06-01: SEK 1,390/),
    ).toBeTruthy();
  });

  it('exposes a price-increase accessibility label without a color-only signal', () => {
    render(
      <ReceiptCard
        subscriptionName="Netflix"
        categoryCode="VIDEO_STREAMING"
        currentPriceMinorUnits={139000}
        currencyCode="SEK"
        cadence="monthly"
        priceHistory={[
          { date: '2026-01-01', amountMinorUnits: 129000 },
          { date: '2026-06-01', amountMinorUnits: 139000 },
        ]}
      />,
    );
    expect(screen.getByLabelText('Price increased to SEK 1,390')).toBeTruthy();
  });
});
