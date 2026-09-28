import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import I18n from 'i18n-js';
import { catalogs } from '@subtrack/i18n';
import { Locale } from '@/types';

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => Promise<void>;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const LOCALE_KEY = 'locale-preference';

// Initialize i18n configuration
I18n.defaultLocale = 'en';
I18n.fallbacks = { sv: 'en' };
I18n.translations = catalogs as Record<string, Record<string, unknown>>;

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadLocale = async () => {
      try {
        const stored = await AsyncStorage.getItem(LOCALE_KEY);
        const userLocale = (stored as Locale) || 'en';
        if (userLocale === 'en' || userLocale === 'sv') {
          setLocaleState(userLocale);
          I18n.locale = userLocale;
        } else {
          I18n.locale = 'en';
        }
      } catch (error) {
        console.error('Failed to load locale:', error);
      } finally {
        setIsLoaded(true);
      }
    };

    loadLocale();
  }, []);

  const setLocale = async (newLocale: Locale) => {
    try {
      await AsyncStorage.setItem(LOCALE_KEY, newLocale);
      setLocaleState(newLocale);
      I18n.locale = newLocale;
    } catch (error) {
      console.error('Failed to save locale:', error);
    }
  };

  const t = (key: string): string => {
    return I18n.t(key);
  };

  const value: I18nContextType = {
    locale,
    setLocale,
    t,
  };

  if (!isLoaded) {
    return null;
  }

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}
