import { getPaletteByTheme } from './colors';
import type { Theme } from '@/types';

const mockTheme: Theme = {
  color: {
    light: {
      'bg.canvas': '#F7F4EE',
      'ink.primary': '#15161C',
    },
    dark: {
      'bg.canvas': '#0A0C14',
      'ink.primary': '#F2EFE8',
    },
  },
  gradient: {},
  typography: {
    fontFamily: { display: 'Fraunces', ui: 'Manrope', mono: 'JetBrains Mono' },
    fontSize: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22 },
  },
  radius: { card: 20, sheet: 28, pill: 9999 },
  motion: {},
  contrastPairs: [],
  memberAccent: {},
  categoryHue: {},
};

describe('getPaletteByTheme', () => {
  it('should return light palette when isDark is false', () => {
    const palette = getPaletteByTheme(mockTheme, false);
    expect(palette['bg.canvas']).toBe('#F7F4EE');
    expect(palette['ink.primary']).toBe('#15161C');
  });

  it('should return dark palette when isDark is true', () => {
    const palette = getPaletteByTheme(mockTheme, true);
    expect(palette['bg.canvas']).toBe('#0A0C14');
    expect(palette['ink.primary']).toBe('#F2EFE8');
  });
});
