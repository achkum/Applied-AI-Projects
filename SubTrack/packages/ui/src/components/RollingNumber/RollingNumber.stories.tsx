import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
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
