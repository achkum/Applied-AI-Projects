import type { Meta, StoryObj } from '@storybook/react';
import { catalogs } from '@subtrack/i18n';
import { HomeScreen } from './HomeScreen';

const meta = {
  id: 'screens-home',
  title: 'Screens/Home',
  component: HomeScreen,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof HomeScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SvLight: Story = {
  name: 'Swedish · Light',
  globals: { theme: 'light' },
  args: { locale: 'sv' },
  parameters: { docs: { description: { story: catalogs.sv.home.scopeDisclosure } } },
};

export const SvDark: Story = {
  name: 'Swedish · Dark',
  globals: { theme: 'dark' },
  args: { locale: 'sv' },
  parameters: { docs: { description: { story: catalogs.sv.home.scopeDisclosure } } },
};

export const EnLight: Story = {
  name: 'English · Light',
  globals: { theme: 'light' },
  args: { locale: 'en' },
  parameters: { docs: { description: { story: catalogs.en.home.scopeDisclosure } } },
};

export const EnDark: Story = {
  name: 'English · Dark',
  globals: { theme: 'dark' },
  args: { locale: 'en' },
  parameters: { docs: { description: { story: catalogs.en.home.scopeDisclosure } } },
};
