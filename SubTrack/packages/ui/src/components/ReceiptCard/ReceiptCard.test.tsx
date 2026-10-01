import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { ReceiptCard, PricePoint } from './ReceiptCard';

const baseProps = {
  name: 'Spotify',
  category: 'music-audio',
  amountMinor: 10900,
  currency: 'SEK',
  locale: 'sv-SE' as const,
  cadenceLabel: 'per month',
};

describe('ReceiptCard', () => {
  it('renders subscription name as heading', () => {
    render(<ReceiptCard {...baseProps} />);
    expect(screen.getByRole('heading', { name: 'Spotify' })).toBeTruthy();
  });

  it('displays formatted price', () => {
    render(<ReceiptCard {...baseProps} />);
    expect(screen.getByText(/109/)).toBeTruthy();
  });

  it('shows cadence label', () => {
    render(<ReceiptCard {...baseProps} />);
    expect(screen.getByText('per month')).toBeTruthy();
  });

  it('omits sparkline when no price history', () => {
    const { container } = render(<ReceiptCard {...baseProps} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders SVG sparkline when 2+ history points provided', () => {
    const history: PricePoint[] = [
      { date: '2025-01', amountMinor: 9900 },
      { date: '2025-06', amountMinor: 10900 },
    ];
    const { container } = render(<ReceiptCard {...baseProps} priceHistory={history} />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('renders accessible price history summary', () => {
    const history: PricePoint[] = [
      { date: '2025-01', amountMinor: 9900 },
      { date: '2025-06', amountMinor: 10900 },
    ];
    render(
      <ReceiptCard {...baseProps} priceHistory={history} priceHistoryLabel="Price history" />,
    );
    expect(screen.getByText('Price history')).toBeTruthy();
  });

  it('has no axe accessibility violations', async () => {
    const { container } = render(<ReceiptCard {...baseProps} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
