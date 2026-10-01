import type { Theme } from '@/types';

/**
 * Shared minimal theme fixture for signature-component tests. Values are
 * copied verbatim from `packages/ui-tokens/generated/theme.native.json`
 * (not invented) so tests exercise real token shapes.
 */
export const testTheme: Theme = {
  color: {
    light: {
      'bg.canvas': '#F7F4EE',
      'bg.raised': '#FFFFFF',
      'bg.sunken': '#EFEAE1',
      'ink.primary': '#15161C',
      'ink.secondary': '#5B5E6B',
      'aurora.green': '#0E9F6E',
      'aurora.violet': '#6A58F0',
      'ember.amber': '#C77700',
    },
    dark: {
      'bg.canvas': '#0A0C14',
      'bg.raised': '#12162A',
      'bg.sunken': '#070810',
      'ink.primary': '#F2EFE8',
      'ink.secondary': '#A5A9BE',
      'aurora.green': '#3DE0A3',
      'aurora.violet': '#9B8CFF',
      'ember.amber': '#FFB547',
    },
  },
  gradient: {},
  typography: {
    fontFamily: { display: 'Fraunces', ui: 'Manrope', mono: 'JetBrains Mono' },
    fontSize: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, '2xl': 28, '3xl': 36, '4xl': 48, hero: 64 },
    fontVariantNumeric: 'tabular-nums',
  },
  radius: { card: 20, sheet: 28, pill: 9999 },
  motion: { spring: { damping: 18, stiffness: 180 } },
  contrastPairs: [],
  memberAccent: {
    slots: {
      'member.accent.01': { light: '#A33F55', dark: '#FF8297' },
      'member.accent.02': { light: '#A65D12', dark: '#FFC06B' },
      'member.accent.03': { light: '#777300', dark: '#E4D85B' },
      'member.accent.04': { light: '#147A4B', dark: '#52D995' },
      'member.accent.05': { light: '#087A83', dark: '#58DCE5' },
      'member.accent.06': { light: '#386EB2', dark: '#83B9FF' },
      'member.accent.07': { light: '#7953B3', dark: '#C4A0FF' },
      'member.accent.08': { light: '#A63D8C', dark: '#F18BD1' },
    },
  },
  categoryHue: {
    VIDEO_STREAMING: { light: 'oklch(0.58 0.14 0)', dark: 'oklch(0.72 0.14 0)' },
  },
};
