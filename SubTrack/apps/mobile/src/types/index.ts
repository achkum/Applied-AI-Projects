export type Locale = 'en' | 'sv';
export type ThemeMode = 'light' | 'dark' | 'system';

export interface Theme {
  color: {
    light: Record<string, string>;
    dark: Record<string, string>;
  };
  gradient: Record<string, Record<string, unknown>>;
  typography: {
    fontFamily: Record<string, string>;
    fontSize: Record<string, number>;
    fontVariantNumeric?: string;
  };
  radius: Record<string, number>;
  motion: Record<string, unknown>;
  contrastPairs: Array<Record<string, string>>;
  memberAccent: {
    slots: Record<string, { light: string; dark: string }>;
  };
  categoryHue: Record<string, Record<string, string>>;
}

export interface SecureTokenStore {
  getToken: (key: string) => Promise<string | null>;
  setToken: (key: string, token: string) => Promise<void>;
  removeToken: (key: string) => Promise<void>;
}
