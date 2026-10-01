import type { Meta, StoryObj } from '@storybook/react';
import { WelcomeScreen } from './WelcomeScreen';

const meta = {
  title: 'Screens/Welcome',
  component: WelcomeScreen,
  parameters: { layout: 'fullscreen' },
  tags: ['g-design'],
} satisfies Meta<typeof WelcomeScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    subtitle: 'Allt ni prenumererar på. På ett ställe.',
  },
};

export const Light: Story = {
  args: {
    subtitle: 'Allt ni prenumererar på. På ett ställe.',
  },
};

export const Dark: Story = {
  args: {
    subtitle: 'Allt ni prenumererar på. På ett ställe.',
  },
};

export const EnLocale: Story = {
  name: 'en-SE locale',
  args: {
    subtitle: 'Everything you subscribe to. In one place.',
  },
};

export const ReducedMotion: Story = {
  args: {
    subtitle: 'Allt ni prenumererar på. På ett ställe.',
    reduceMotion: true,
  },
};
