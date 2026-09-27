export type ThemeName = 'light' | 'dark';

export interface TokenSource {
  color: Record<ThemeName, Record<string, string>>;
  typography: {
    fontFamily: Record<string, string>;
    fontSize: Record<string, number>;
    fontVariantNumeric: string;
  };
  radius: Record<string, number>;
  motion: {
    spring: { damping: number; stiffness: number };
    auroraLoopSeconds: number;
    orbitRevolutionSeconds: number;
    reducedMotion: { freezeAurora: boolean; disableOrbitRotation: boolean };
  };
  contrastPairs: Array<{ foreground: string; background: string }>;
}

export type CategoryHueMap = Record<
  string,
  Record<ThemeName, `oklch(${number} ${number} ${number})`>
>;
