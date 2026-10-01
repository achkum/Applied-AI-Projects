import type { Meta, StoryObj } from '@storybook/react';
import { Orbit } from './Orbit';
import type { OrbitSubscription } from './types';

const SAMPLE_SUBS: OrbitSubscription[] = [
  { id: 'netflix',  name: 'Netflix',   category: 'streaming',    ownerType: 'ME',        monthlyCostMinor: 13900, billingCadence: 'MONTHLY' },
  { id: 'spotify',  name: 'Spotify',   category: 'music',        ownerType: 'ME',        monthlyCostMinor:  9900, billingCadence: 'MONTHLY' },
  { id: 'gh',       name: 'GitHub',    category: 'productivity', ownerType: 'ME',        monthlyCostMinor:  8800, billingCadence: 'ANNUAL'  },
  { id: 'icloud',   name: 'iCloud',    category: 'cloud',        ownerType: 'HOUSEHOLD', monthlyCostMinor:  2900, billingCadence: 'MONTHLY' },
  { id: 'hbo',      name: 'HBO Max',   category: 'streaming',    ownerType: 'HOUSEHOLD', monthlyCostMinor: 11900, billingCadence: 'MONTHLY' },
  { id: 'peloton',  name: 'Peloton',   category: 'fitness',      ownerType: 'MEMBER', memberId: 'alice', monthlyCostMinor: 44900, billingCadence: 'MONTHLY' },
  { id: 'xbox',     name: 'Xbox GP',   category: 'gaming',       ownerType: 'MEMBER', memberId: 'bob',   monthlyCostMinor:  8900, billingCadence: 'MONTHLY' },
  { id: 'nytimes',  name: 'NYTimes',   category: 'news',         ownerType: 'MEMBER', memberId: 'alice', monthlyCostMinor:  1700, billingCadence: 'ANNUAL'  },
];

const meta: Meta<typeof Orbit> = {
  title: 'Components/Orbit',
  component: Orbit,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    onBodySelect: { action: 'bodySelected' },
  },
};

export default meta;
type Story = StoryObj<typeof Orbit>;

export const Default: Story = {
  args: {
    subscriptions: SAMPLE_SUBS,
    ariaLabel: 'Your subscription orbit',
  },
};

export const WithActiveBody: Story = {
  args: {
    subscriptions: SAMPLE_SUBS,
    activeId: 'netflix',
    ariaLabel: 'Orbit with Netflix selected',
  },
};

export const SingleSubscription: Story = {
  args: {
    subscriptions: [SAMPLE_SUBS[0]],
    ariaLabel: 'Single subscription',
  },
};

export const Empty: Story = {
  args: {
    subscriptions: [],
    ariaLabel: 'Empty orbit',
  },
};

/** Dark canvas — wrap in a dark background to preview dark-mode colours. */
export const DarkCanvas: Story = {
  parameters: {
    backgrounds: { default: 'dark' },
  },
  args: {
    subscriptions: SAMPLE_SUBS,
    ariaLabel: 'Dark mode orbit',
  },
};
