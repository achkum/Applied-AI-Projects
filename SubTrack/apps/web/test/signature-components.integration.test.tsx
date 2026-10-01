import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RollingNumber, ScopeSwitcher, ReceiptCard, ScopeOption } from '@subtrack/ui';

// Mock framer-motion to avoid animation complexity in integration tests
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    span: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
      <span {...props}>{children}</span>
    ),
  },
  useReducedMotion: () => false,
}));

describe('RollingNumber integration', () => {
  it('renders formatted SEK amount with sv-SE locale', () => {
    render(
      <RollingNumber
        amountMinor={139000}
        currency="SEK"
        locale="sv-SE"
        period="monthly"
        onPeriodChange={vi.fn()}
        monthlyLabel="Monthly"
        annualLabel="Annual"
      />,
    );
    expect(screen.getByText(/1.?390/)).toBeTruthy();
  });

  it('calls onPeriodChange when period toggle is clicked', () => {
    const onPeriodChange = vi.fn();
    render(
      <RollingNumber
        amountMinor={139000}
        currency="SEK"
        locale="sv-SE"
        period="monthly"
        onPeriodChange={onPeriodChange}
        monthlyLabel="Monthly"
        annualLabel="Annual"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Annual' }));
    expect(onPeriodChange).toHaveBeenCalledWith('annual');
  });
});

describe('ScopeSwitcher integration', () => {
  const options: ScopeOption[] = [
    { kind: 'me', label: 'Me' },
    { kind: 'household', label: 'Household' },
    { kind: 'member', memberId: 'member-abc', displayName: 'Alice' },
  ];

  it('renders all scope options', () => {
    render(<ScopeSwitcher options={options} selectedIndex={0} onSelect={vi.fn()} />);
    expect(screen.getByRole('radio', { name: 'Me' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Household' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Alice' })).toBeTruthy();
  });

  it('fires onSelect with member index when member clicked', () => {
    const onSelect = vi.fn();
    render(<ScopeSwitcher options={options} selectedIndex={0} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Alice' }));
    expect(onSelect).toHaveBeenCalledWith(2);
  });
});

describe('ReceiptCard integration', () => {
  it('renders subscription name and formatted price', () => {
    render(
      <ReceiptCard
        name="Spotify"
        category="music-audio"
        amountMinor={10900}
        currency="SEK"
        locale="sv-SE"
        cadenceLabel="per month"
      />,
    );
    expect(screen.getByRole('heading', { name: 'Spotify' })).toBeTruthy();
    expect(screen.getByText(/109/)).toBeTruthy();
    expect(screen.getByText('per month')).toBeTruthy();
  });

  it('shows sparkline and history summary when price history is provided', () => {
    const { container } = render(
      <ReceiptCard
        name="Netflix"
        category="video-streaming"
        amountMinor={18900}
        currency="SEK"
        locale="sv-SE"
        cadenceLabel="per month"
        priceHistoryLabel="Price history"
        priceHistory={[
          { date: '2025-01', amountMinor: 15900 },
          { date: '2025-06', amountMinor: 18900 },
        ]}
      />,
    );
    expect(container.querySelector('svg')).not.toBeNull();
    expect(screen.getByText('Price history')).toBeTruthy();
  });
});
