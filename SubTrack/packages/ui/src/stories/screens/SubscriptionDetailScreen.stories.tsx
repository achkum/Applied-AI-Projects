import type { Meta, StoryObj } from '@storybook/react';
import { SubscriptionDetailScreen } from './SubscriptionDetailScreen';

const meta = {
  id: 'screens-subscription-detail',
  title: 'Screens/Subscription Detail',
  component: SubscriptionDetailScreen,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof SubscriptionDetailScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SvLight: Story = {
  name: 'Swedish · Light',
  globals: { theme: 'light' },
  args: { locale: 'sv' },
};

export const SvDark: Story = {
  name: 'Swedish · Dark',
  globals: { theme: 'dark' },
  args: { locale: 'sv' },
};

export const EnLight: Story = {
  name: 'English · Light',
  globals: { theme: 'light' },
  args: { locale: 'en' },
};

export const EnDark: Story = {
  name: 'English · Dark',
  globals: { theme: 'dark' },
  args: { locale: 'en' },
};
