import { en, sv } from '@/i18n/signatureComponents';
import { catalogs } from '@subtrack/i18n';
import { Locale } from '@/types';
import { testTheme } from '../testTheme';

const merged: Record<Locale, Record<string, unknown>> = {
  en: { ...catalogs.en, ...en },
  sv: { ...catalogs.sv, ...sv },
};

function resolve(catalog: Record<string, unknown>, key: string): string | undefined {
  const value = key.split('.').reduce<unknown>((node, part) => {
    if (node && typeof node === 'object') return (node as Record<string, unknown>)[part];
    return undefined;
  }, catalog);
  return typeof value === 'string' ? value : undefined;
}

export function makeI18n(locale: Locale = 'en') {
  return {
    locale,
    setLocale: jest.fn(),
    t: (key: string, options?: Record<string, string | number>) => {
      const template = resolve(merged[locale], key) ?? key;
      return template.replace(/%\{(\w+)\}/g, (_match, name) => String(options?.[name] ?? ''));
    },
  };
}

export function makeTheme(isDark = false) {
  return {
    mode: 'light' as const,
    setMode: jest.fn(),
    theme: testTheme,
    isDark,
  };
}
