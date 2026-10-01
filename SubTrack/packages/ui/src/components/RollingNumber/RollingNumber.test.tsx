import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'jest-axe';
import { RollingNumber } from './RollingNumber';

const defaultProps = {
  amountMinor: 139000,
  currency: 'SEK',
  locale: 'sv-SE' as const,
  period: 'monthly' as const,
  onPeriodChange: vi.fn(),
  monthlyLabel: 'Monthly',
  annualLabel: 'Annual',
};

describe('RollingNumber', () => {
  it('formats and displays the amount in sv-SE locale', () => {
    render(<RollingNumber {...defaultProps} />);
    expect(screen.getByText(/1\s*390/)).toBeTruthy();
  });

  it('formats in en-SE locale (contains 1390 digits)', () => {
    render(<RollingNumber {...defaultProps} locale="en-SE" />);
    expect(screen.getByText(/1.?390/)).toBeTruthy();
  });

  it('renders period toggle buttons', () => {
    render(<RollingNumber {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Monthly' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Annual' })).toBeTruthy();
  });

  it('marks active period with aria-pressed', () => {
    render(<RollingNumber {...defaultProps} period="annual" />);
    expect(screen.getByRole('button', { name: 'Annual' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Monthly' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onPeriodChange when toggle clicked', () => {
    const onPeriodChange = vi.fn();
    render(<RollingNumber {...defaultProps} onPeriodChange={onPeriodChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Annual' }));
    expect(onPeriodChange).toHaveBeenCalledWith('annual');
  });

  it('shows loading label when isLoading', () => {
    render(<RollingNumber {...defaultProps} isLoading loadingLabel="Loading…" />);
    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('shows unavailable label when provided', () => {
    render(<RollingNumber {...defaultProps} unavailableLabel="Unavailable" />);
    expect(screen.getByText('Unavailable')).toBeTruthy();
  });

  it('has no axe accessibility violations', async () => {
    const { container } = render(<RollingNumber {...defaultProps} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
