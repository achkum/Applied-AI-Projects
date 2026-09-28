import { Theme } from '@/types';

export function getColorByTheme(
  theme: Theme,
  isDark: boolean,
  colorKey: string
): string {
  const colorMap = isDark ? theme.color.dark : theme.color.light;
  return colorMap[colorKey as keyof typeof colorMap] || '#000000';
}

export function getPaletteByTheme(theme: Theme, isDark: boolean) {
  return isDark ? theme.color.dark : theme.color.light;
}
