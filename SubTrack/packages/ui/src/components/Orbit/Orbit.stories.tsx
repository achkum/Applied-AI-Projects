import type { Meta, StoryObj } from '@storybook/react';
import React, { useState } from 'react';
import { catalogs } from '@subtrack/i18n';
import type { Locale } from '@subtrack/i18n';
import { Orbit } from './Orbit';
import type { OrbitPresentation, OrbitSubscription } from './types';

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

const AMOUNT_LABELS: Record<string, string> = {
  netflix: '139\u00a0kr',
  spotify: '99\u00a0kr',
  gh: '88\u00a0kr',
  icloud: '29\u00a0kr',
  hbo: '119\u00a0kr',
  peloton: '449\u00a0kr',
  xbox: '89\u00a0kr',
  nytimes: '17\u00a0kr',
};

const CATEGORY_LABEL_READERS: Record<string, (locale: Locale) => string> = {
  streaming: (locale) => catalogs[locale].orbit.categoryLabels.streaming,
  music: (locale) => catalogs[locale].orbit.categoryLabels.music,
  productivity: (locale) => catalogs[locale].orbit.categoryLabels.productivity,
  cloud: (locale) => catalogs[locale].orbit.categoryLabels.cloud,
  fitness: (locale) => catalogs[locale].orbit.categoryLabels.fitness,
  gaming: (locale) => catalogs[locale].orbit.categoryLabels.gaming,
  news: (locale) => catalogs[locale].orbit.categoryLabels.news,
};

export function buildPresentationById(locale: Locale): Record<string, OrbitPresentation> {
  const catalog = catalogs[locale];
  return Object.fromEntries(SAMPLE_SUBS.map((subscription): [string, OrbitPresentation] => {
    const categoryReader = CATEGORY_LABEL_READERS[subscription.category];
    const amountLabel = AMOUNT_LABELS[subscription.id];
    if (!categoryReader || !amountLabel) {
      throw new Error('The Orbit presentation fixture must provide every sample label.');
    }

    let ownerLabel: string;
    if (subscription.ownerType === 'MEMBER') {
      // Synthetic names are attached only to the existing fictional story member IDs.
      if (subscription.memberId === 'alice') ownerLabel = 'Alice';
      else if (subscription.memberId === 'bob') ownerLabel = 'Bob';
      else throw new Error('The Orbit presentation fixture has an unknown synthetic member ID.');
    } else {
      ownerLabel = catalog.orbit.ownerType[subscription.ownerType];
    }

    return [subscription.id, {
      categoryLabel: categoryReader(locale),
      amountLabel: `${amountLabel} ${catalog.orbit.monthlyEquivalent}`,
      cadenceLabel: catalog.orbit.billingCadence[subscription.billingCadence],
      ownerLabel,
    }];
  }));
}

export function WithPresentationRender(args: React.ComponentProps<typeof Orbit>) {
  const [activeId, setActiveId] = useState(args.activeId);
  const locale = args.locale ?? 'en';
  return (
    <Orbit
      {...args}
      activeId={activeId}
      locale={locale}
      presentationById={buildPresentationById(locale)}
      onBodySelect={(id) => {
        setActiveId(id);
        args.onBodySelect?.(id);
      }}
    />
  );
}

const meta: Meta<typeof Orbit> = {
  title: 'Components/Orbit',
  component: Orbit,
  excludeStories: ['buildPresentationById', 'WithPresentationRender'],
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    onBodySelect: { action: 'bodySelected' },
    locale: { control: 'inline-radio', options: ['en', 'sv'] },
    activeId: { control: false },
    presentationById: { control: false },
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
    subscriptions: SAMPLE_SUBS[0] ? [SAMPLE_SUBS[0]] : [],
    ariaLabel: 'Single subscription',
  },
};

export const Empty: Story = {
  args: {
    subscriptions: [],
    ariaLabel: 'Empty orbit',
  },
};

/** Dark canvas — use the preview decorator's generated dark theme tokens. */
export const DarkCanvas: Story = {
  globals: { theme: 'dark' },
  args: {
    subscriptions: SAMPLE_SUBS,
    ariaLabel: 'Dark mode orbit',
  },
};

export const WithPresentation: Story = {
  args: {
    subscriptions: SAMPLE_SUBS,
    locale: 'en',
  },
  render: WithPresentationRender,
};
