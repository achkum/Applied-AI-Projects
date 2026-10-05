import type { Meta, StoryObj } from '@storybook/react';
import { WelcomeScreen } from './WelcomeScreen';

const meta = {
  id: 'screens-welcome',
  title: 'Screens/Welcome',
  component: WelcomeScreen,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof WelcomeScreen>;

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

export const ReducedMotion: Story = {
  name: 'Reduced motion',
  globals: { theme: 'dark' },
  args: { locale: 'sv', reducedMotion: true },
};
