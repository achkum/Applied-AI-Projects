import type { Meta, StoryObj } from '@storybook/react';
import { SubscriptionDetailScreen } from './SubscriptionDetailScreen';
import type { PricePoint } from '../../components/ReceiptCard/ReceiptCard';

const SPOTIFY_HISTORY: PricePoint[] = [
  { date: '2024-01', amountMinor: 9900 },
  { date: '2024-07', amountMinor: 9900 },
  { date: '2025-01', amountMinor: 10900 },
  { date: '2025-07', amountMinor: 10900 },
];

const NETFLIX_HISTORY: PricePoint[] = [
  { date: '2024-01', amountMinor: 15900 },
  { date: '2024-07', amountMinor: 15900 },
  { date: '2025-01', amountMinor: 18900 },
  { date: '2025-07', amountMinor: 18900 },
];

const meta = {
  title: 'Screens/SubscriptionDetail',
  component: SubscriptionDetailScreen,
  parameters: { layout: 'fullscreen' },
  tags: ['g-design'],
} satisfies Meta<typeof SubscriptionDetailScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    name: 'Spotify',
    category: 'music-audio',
    amountMinor: 10900,
    currency: 'SEK',
    locale: 'sv-SE',
    cadenceLabel: 'per månad',
    priceHistory: SPOTIFY_HISTORY,
    priceHistoryLabel: 'Prishistorik',
    backLabel: 'Tillbaka',
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
    name: 'Spotify',
    category: 'music-audio',
    amountMinor: 10900,
    currency: 'SEK',
    locale: 'en-SE',
    cadenceLabel: 'per month',
    priceHistory: SPOTIFY_HISTORY,
    priceHistoryLabel: 'Price history',
    backLabel: 'Back',
  },
};

export const PriceIncrease: Story = {
  args: {
    name: 'Netflix',
    category: 'video-streaming',
    amountMinor: 18900,
    currency: 'SEK',
    locale: 'sv-SE',
    cadenceLabel: 'per månad',
    priceHistory: NETFLIX_HISTORY,
    priceHistoryLabel: 'Prishistorik',
    backLabel: 'Tillbaka',
  },
};

export const NoHistory: Story = {
  args: {
    name: 'GitHub Copilot',
    category: 'software-productivity',
    amountMinor: 10900,
    currency: 'SEK',
    locale: 'sv-SE',
    cadenceLabel: 'per månad',
    backLabel: 'Tillbaka',
  },
};
