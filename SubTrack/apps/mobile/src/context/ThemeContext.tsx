import {androidFontFamily} from '@/utils/androidFontFamilies';
import {iosFontFamily} from '@/utils/iosFontFamilies';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import themeData from '@subtrack/ui-tokens';
import billingMonthTheme from '@subtrack/ui-tokens/billing-month';
import { Theme, ThemeMode } from '@/types';

interface ThemeContextType {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => Promise<void>;
  theme: Theme;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_MODE_KEY = 'theme-mode-preference';

interface ThemeProviderProps {
  children: React.ReactNode;
  useSystemFonts?: boolean;
  systemFontFamily?: string | undefined;
}

export function ThemeProvider({ children, useSystemFonts = false, systemFontFamily = 'system-ui' }: ThemeProviderProps) {
  const colorScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadThemeMode = async () => {
      try {
        const stored = await AsyncStorage.getItem(THEME_MODE_KEY);
        if (stored && (stored === 'light' || stored === 'dark' || stored === 'system')) {
          setModeState(stored as ThemeMode);
        }
      } catch (error) {
        console.error('Failed to load theme mode:', error);
      } finally {
        setIsLoaded(true);
      }
    };

    loadThemeMode();
  }, []);

  const setMode = async (newMode: ThemeMode) => {
    try {
      await AsyncStorage.setItem(THEME_MODE_KEY, newMode);
      setModeState(newMode);
    } catch (error) {
      console.error('Failed to save theme mode:', error);
    }
  };

  const isDark =
    mode === 'system' ? colorScheme === 'dark' : mode === 'dark';

  const selectedTheme = (Platform.OS === 'android' || Platform.OS === 'ios' ? billingMonthTheme : themeData) as Theme;
  const baseTheme: Theme = Platform.OS === 'android' || Platform.OS === 'ios' ? {...selectedTheme,typography:{...selectedTheme.typography,fontFamily:Object.fromEntries(Object.entries(selectedTheme.typography.fontFamily).map(([role,family])=>[role,Platform.OS === 'android' ? androidFontFamily(family) : iosFontFamily(family)]))}} : selectedTheme;
  const theme: Theme = useSystemFonts ? {
    ...baseTheme,
    typography: {
      ...baseTheme.typography,
      fontFamily: Platform.OS === 'android' || Platform.OS === 'ios'
        ? Object.fromEntries(Object.keys(baseTheme.typography.fontFamily).map(role => [role, systemFontFamily]))
        : {...baseTheme.typography.fontFamily,ui:systemFontFamily,display:systemFontFamily},
    },
  } : baseTheme;

  const value: ThemeContextType = {
    mode,
    setMode,
    theme,
    isDark,
  };

  if (!isLoaded) {
    return null;
  }

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
