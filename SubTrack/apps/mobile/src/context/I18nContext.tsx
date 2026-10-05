import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18n } from 'i18n-js';
import { catalogs } from '@subtrack/i18n';
import { Locale } from '@/types';
import { en as signatureComponentsEn, sv as signatureComponentsSv } from '@/i18n/signatureComponents';

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => Promise<void>;
  t: (key: string, options?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const LOCALE_KEY = 'locale-preference';

function createI18n(): I18n {
  return new I18n(
    {
      en: { ...catalogs.en, ...signatureComponentsEn },
      sv: { ...catalogs.sv, ...signatureComponentsSv },
    },
    { defaultLocale: 'en', locale: 'en', enableFallback: true },
  );
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [i18n] = useState(createI18n);
  const [locale, setLocaleState] = useState<Locale>('en');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadLocale = async () => {
      try {
        const stored = await AsyncStorage.getItem(LOCALE_KEY);
        const userLocale = stored === 'sv' || stored === 'en' ? stored : 'en';
        i18n.locale = userLocale;
        setLocaleState(userLocale);
      } catch {
        console.error('Failed to load locale preference.');
      } finally {
        setIsLoaded(true);
      }
    };

    loadLocale();
  }, []);

  const setLocale = async (newLocale: Locale) => {
    try {
      await AsyncStorage.setItem(LOCALE_KEY, newLocale);
      i18n.locale = newLocale;
      setLocaleState(newLocale);
    } catch {
      console.error('Failed to save locale preference.');
    }
  };

  const t = (key: string, options?: Record<string, string | number>): string => {
    return i18n.t(key, options);
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
