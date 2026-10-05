import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { catalogs } from '@subtrack/i18n';
import type { Locale } from '@subtrack/i18n';
import { RollingNumber } from './RollingNumber';

const meta = {
  title: 'Signature/RollingNumber',
  component: RollingNumber,
  tags: ['autodocs'],
  args: {
    currency: 'SEK',
    period: 'monthly',
    onPeriodChange: fn(),
    monthlyLabel: 'Monthly',
    annualLabel: 'Annual',
  },
} satisfies Meta<typeof RollingNumber>;

export default meta;
type Story = StoryObj<typeof meta>;

function localizedStoryArgs(locale: Locale) {
  const catalog = catalogs[locale];
  return {
    amountMinor: 139000,
    locale: locale === 'sv' ? 'sv-SE' as const : 'en-SE' as const,
    period: 'monthly' as const,
    periodGroupLabel: catalog.rollingTotal.periodGroupLabel,
    monthlyLabel: catalog.orbit.billingCadence.MONTHLY,
    annualLabel: catalog.orbit.billingCadence.ANNUAL,
  };
}

export const SvMonthly: Story = {
  name: 'sv-SE Monthly',
  args: {
    amountMinor: 139000,
    locale: 'sv-SE',
    period: 'monthly',
  },
};

export const SvAnnual: Story = {
  name: 'sv-SE Annual',
  args: {
    amountMinor: 1668000,
    locale: 'sv-SE',
    period: 'annual',
  },
};

export const EnMonthly: Story = {
  name: 'en-SE Monthly',
  args: {
    amountMinor: 139000,
    locale: 'en-SE',
    period: 'monthly',
  },
};

export const Loading: Story = {
  args: {
    amountMinor: 0,
    locale: 'sv-SE',
    isLoading: true,
    loadingLabel: 'Loading…',
  },
};

export const Unavailable: Story = {
  args: {
    amountMinor: 0,
    locale: 'sv-SE',
    unavailableLabel: 'Unavailable',
  },
};

export const WithLocalizedGroupEnLight: Story = {
  globals: { theme: 'light' },
  args: localizedStoryArgs('en'),
};

export const WithLocalizedGroupEnDark: Story = {
  globals: { theme: 'dark' },
  args: localizedStoryArgs('en'),
};

export const WithLocalizedGroupSvLight: Story = {
  globals: { theme: 'light' },
  args: localizedStoryArgs('sv'),
};

export const WithLocalizedGroupSvDark: Story = {
  globals: { theme: 'dark' },
  args: localizedStoryArgs('sv'),
};
