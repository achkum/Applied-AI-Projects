export type Locale = 'en' | 'sv';
export type ThemeMode = 'light' | 'dark' | 'system';

export interface Theme {
  color: {
    light: Record<string, string>;
    dark: Record<string, string>;
  };
  gradient: Record<string, any>;
  typography: Record<string, any>;
  spacing: Record<string, any>;
  borderRadius: Record<string, any>;
  shadow: Record<string, any>;
}

export interface SecureTokenStore {
  getToken: (key: string) => Promise<string | null>;
  setToken: (key: string, token: string) => Promise<void>;
  removeToken: (key: string) => Promise<void>;
}
