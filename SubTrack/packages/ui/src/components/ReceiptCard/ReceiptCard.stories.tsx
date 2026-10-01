import type { Meta, StoryObj } from '@storybook/react';
import { ReceiptCard, PricePoint } from './ReceiptCard';

const history: PricePoint[] = [
  { date: '2024-09', amountMinor: 9900 },
  { date: '2024-12', amountMinor: 9900 },
  { date: '2025-03', amountMinor: 9900 },
  { date: '2025-06', amountMinor: 10900 },
  { date: '2025-09', amountMinor: 10900 },
];

const meta = {
  title: 'Signature/ReceiptCard',
  component: ReceiptCard,
  tags: ['autodocs'],
  args: {
    name: 'Spotify',
    category: 'music-audio',
    currency: 'SEK',
    locale: 'sv-SE' as const,
    cadenceLabel: 'per month',
    priceHistoryLabel: 'Price history',
  },
} satisfies Meta<typeof ReceiptCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { amountMinor: 10900, priceHistory: history },
};

export const PriceIncrease: Story = {
  args: { amountMinor: 10900, priceHistory: history },
};

export const NoHistory: Story = {
  args: { amountMinor: 10900 },
};

export const VideoStreaming: Story = {
  args: {
    name: 'Netflix',
    category: 'video-streaming',
    amountMinor: 18900,
    priceHistory: [
      { date: '2024-06', amountMinor: 15900 },
      { date: '2025-01', amountMinor: 18900 },
    ],
  },
};

export const SvAnnual: Story = {
  name: 'sv-SE Annual',
  args: {
    locale: 'sv-SE',
    amountMinor: 130800,
    cadenceLabel: 'per år',
    priceHistory: history,
  },
};

export const EnLocale: Story = {
  name: 'en-SE locale',
  args: {
    locale: 'en-SE',
    amountMinor: 10900,
    cadenceLabel: 'per month',
    priceHistory: history,
  },
};
