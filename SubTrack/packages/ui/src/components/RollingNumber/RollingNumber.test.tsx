import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'jest-axe';
import { catalogs, type Locale } from '@subtrack/i18n';
import { RollingNumber } from './RollingNumber';
import type { RollingNumberProps } from './RollingNumber';
import rollingMeta, {
  WithLocalizedGroupEnLight,
  WithLocalizedGroupSvLight,
} from './RollingNumber.stories';

const defaultProps = {
  amountMinor: 139000,
  currency: 'SEK',
  locale: 'sv-SE' as const,
  period: 'monthly' as const,
  onPeriodChange: vi.fn(),
  monthlyLabel: 'Monthly',
  annualLabel: 'Annual',
};

function propsFromStory(story: { args?: Partial<RollingNumberProps> }): RollingNumberProps {
  const args = story.args;
  const currency = rollingMeta.args.currency;
  if (
    args?.amountMinor === undefined ||
    args.locale === undefined ||
    args.period === undefined ||
    args.periodGroupLabel === undefined ||
    args.monthlyLabel === undefined ||
    args.annualLabel === undefined
  ) {
    throw new Error('Localized RollingNumber story is missing required args.');
  }

  return {
    amountMinor: args.amountMinor,
    currency,
    locale: args.locale,
    period: args.period,
    onPeriodChange: vi.fn(),
    periodGroupLabel: args.periodGroupLabel,
    monthlyLabel: args.monthlyLabel,
    annualLabel: args.annualLabel,
  };
}

describe('RollingNumber', () => {
  it('keeps the legacy period group name when no localized label is supplied', () => {
    render(<RollingNumber {...defaultProps} />);
    expect(screen.getByRole('group', { name: 'Period' })).toBeTruthy();
  });

  it.each([
    ['en', WithLocalizedGroupEnLight],
    ['sv', WithLocalizedGroupSvLight],
  ] as const)(
    'uses the %s story host catalog label for the accessible period group',
    async (locale: Locale, story) => {
      const catalog = catalogs[locale];
      const props = propsFromStory(story);
      const onPeriodChange = vi.fn();
      const { container } = render(
        <RollingNumber {...props} onPeriodChange={onPeriodChange} />,
      );

      expect(screen.getByRole('group', { name: catalog.rollingTotal.periodGroupLabel })).toBeTruthy();
      expect(screen.getByRole('button', { name: catalog.orbit.billingCadence.MONTHLY })).toBeTruthy();
      expect(screen.getByRole('button', { name: catalog.orbit.billingCadence.ANNUAL })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: catalog.orbit.billingCadence.ANNUAL }));
      expect(onPeriodChange).toHaveBeenCalledWith('annual');
      expect(await axe(container)).toHaveNoViolations();
    },
  );

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
