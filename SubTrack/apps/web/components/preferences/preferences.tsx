'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { catalogs, type Locale } from '@subtrack/i18n';
import { useTheme } from '@/lib/theme-provider';
import styles from './preferences.module.css';

const themes = ['light', 'dark', 'system'] as const;

export function Preferences({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const { theme, setTheme, mounted } = useTheme();
  const copy = catalogs[locale].preferences;
  const otherLocale: Locale = locale === 'sv' ? 'en' : 'sv';
  const localizedPath = `/${otherLocale}${pathname.replace(/^\/(sv|en)(?=\/|$)/, '')}`;

  return (
    <nav aria-label={copy.label} className={styles.root}>
      <Link href={localizedPath} hrefLang={otherLocale} lang={otherLocale}>
        {copy.languageLabel}: {copy.languageName[otherLocale]}
      </Link>
      <div aria-label={copy.themeLabel} className={styles.themes} role="group">
        {themes.map((option) => (
          <button
            aria-pressed={mounted ? theme === option : option === 'system'}
            key={option}
            onClick={() => setTheme(option)}
            type="button"
          >
            {copy.themes[option]}
          </button>
        ))}
      </div>
    </nav>
  );
}
