import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { catalogs } from '@subtrack/i18n';
import type { Locale } from '@subtrack/i18n';
import { ScopeSwitcher, ScopeOption } from './ScopeSwitcher';

const meOnly: ScopeOption[] = [{ kind: 'me', label: 'Me' }];
const full: ScopeOption[] = [
  { kind: 'me', label: 'Me' },
  { kind: 'household', label: 'Household' },
  { kind: 'member', memberId: 'member-1', displayName: 'Alex' },
  { kind: 'member', memberId: 'member-2', displayName: 'Sam' },
];

const meta = {
  title: 'Signature/ScopeSwitcher',
  component: ScopeSwitcher,
  tags: ['autodocs'],
  args: {
    onSelect: fn(),
    selectedIndex: 0,
  },
} satisfies Meta<typeof ScopeSwitcher>;

export default meta;
type Story = StoryObj<typeof meta>;

function localizedStoryArgs(locale: Locale) {
  const catalog = catalogs[locale];
  return {
    options: [
      { kind: 'me' as const, label: catalog.scope.personal },
      { kind: 'household' as const, label: catalog.navigation.household },
      { kind: 'member' as const, memberId: 'member-1', displayName: 'Alex' },
      { kind: 'member' as const, memberId: 'member-2', displayName: 'Sam' },
    ],
    selectedIndex: 0,
    ariaLabel: catalog.scopeSwitcher.groupLabel,
  };
}

export const MeSelected: Story = {
  args: { options: full, selectedIndex: 0 },
};

export const HouseholdSelected: Story = {
  args: { options: full, selectedIndex: 1 },
};

export const MemberSelected: Story = {
  args: { options: full, selectedIndex: 2 },
};

export const MeOnly: Story = {
  args: { options: meOnly, selectedIndex: 0 },
};

export const SvLabels: Story = {
  name: 'sv-SE labels',
  args: {
    options: [
      { kind: 'me', label: 'Jag' },
      { kind: 'household', label: 'Hushåll' },
      { kind: 'member', memberId: 'member-1', displayName: 'Alex' },
    ],
    selectedIndex: 0,
  },
};

export const WithLocalizedGroupEnLight: Story = {
  globals: { theme: 'light' },
  args: localizedStoryArgs('en'),
};

export const WithLocalizedGroupEnDark: Story = {
  globals: { theme: 'dark' },
  args: localizedStoryArgs('en'),
};

export const WithLocalizedGroupSvLight: Story = {
  globals: { theme: 'light' },
  args: localizedStoryArgs('sv'),
};

export const WithLocalizedGroupSvDark: Story = {
  globals: { theme: 'dark' },
  args: localizedStoryArgs('sv'),
};
