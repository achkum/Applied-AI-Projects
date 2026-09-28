import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import themeData from '@subtrack/ui-tokens/generated/theme.native.json';
import { Theme, ThemeMode } from '@/types';

interface ThemeContextType {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => Promise<void>;
  theme: Theme;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_MODE_KEY = 'theme-mode-preference';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
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

  const value: ThemeContextType = {
    mode,
    setMode,
    theme: themeData as Theme,
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
