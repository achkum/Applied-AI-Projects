import type { Meta, StoryObj } from '@storybook/react';
import { HomeScreen } from './HomeScreen';
import type { OrbitSubscription } from '../../components/Orbit/types';
import type { ScopeOption } from '../../components/ScopeSwitcher/ScopeSwitcher';

const SAMPLE_SUBS: OrbitSubscription[] = [
  { id: 'netflix',  name: 'Netflix',   category: 'video-streaming',        ownerType: 'ME',        monthlyCostMinor: 18900, billingCadence: 'MONTHLY' },
  { id: 'spotify',  name: 'Spotify',   category: 'music-audio',            ownerType: 'ME',        monthlyCostMinor:  9900, billingCadence: 'MONTHLY' },
  { id: 'gh',       name: 'GitHub',    category: 'software-productivity',   ownerType: 'ME',        monthlyCostMinor:  8800, billingCadence: 'ANNUAL'  },
  { id: 'icloud',   name: 'iCloud',    category: 'cloud-storage',          ownerType: 'HOUSEHOLD', monthlyCostMinor:  2900, billingCadence: 'MONTHLY' },
  { id: 'hbo',      name: 'HBO Max',   category: 'video-streaming',        ownerType: 'HOUSEHOLD', monthlyCostMinor: 11900, billingCadence: 'MONTHLY' },
];

const SCOPES_SV: ScopeOption[] = [
  { kind: 'me', label: 'Jag' },
  { kind: 'household', label: 'Hushåll' },
  { kind: 'member', memberId: 'member-1', displayName: 'Alex' },
];

const SCOPES_EN: ScopeOption[] = [
  { kind: 'me', label: 'Me' },
  { kind: 'household', label: 'Household' },
  { kind: 'member', memberId: 'member-1', displayName: 'Alex' },
];

const MONTHLY_TOTAL = SAMPLE_SUBS.reduce((s, sub) => {
  const monthly = sub.billingCadence === 'ANNUAL' ? Math.round(sub.monthlyCostMinor / 12) : sub.monthlyCostMinor;
  return s + monthly;
}, 0);

const meta = {
  title: 'Screens/Home',
  component: HomeScreen,
  parameters: { layout: 'fullscreen' },
  tags: ['g-design'],
} satisfies Meta<typeof HomeScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    subscriptions: SAMPLE_SUBS,
    scopes: SCOPES_SV,
    amountMinor: MONTHLY_TOTAL,
    currency: 'SEK',
    locale: 'sv-SE',
    monthlyLabel: 'Månadsvis',
    annualLabel: 'Årsvis',
  },
};

export const Light: Story = {
  args: { ...Default.args },
};

export const Dark: Story = {
  args: { ...Default.args },
};

export const EnLocale: Story = {
  name: 'en-SE locale',
  args: {
    subscriptions: SAMPLE_SUBS,
    scopes: SCOPES_EN,
    amountMinor: MONTHLY_TOTAL,
    currency: 'SEK',
    locale: 'en-SE',
    monthlyLabel: 'Monthly',
    annualLabel: 'Annual',
  },
};
