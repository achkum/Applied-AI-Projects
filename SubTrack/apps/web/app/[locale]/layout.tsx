import '@subtrack/ui-tokens/tokens.css';
import { catalogs, type Locale } from '@subtrack/i18n';
import { NextIntlClientProvider } from 'next-intl';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { ThemeProvider } from '@/lib/theme-provider';
import { fontClassNames } from '@/lib/fonts';
import { Preferences } from '@/components/preferences/preferences';

const themeScript = `
  (function() {
    try {
      const theme = localStorage.getItem('theme-preference') || 'system';
      const html = document.documentElement;
      let resolvedTheme = theme;
      if (theme === 'system') {
        resolvedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      if (resolvedTheme === 'dark') html.setAttribute('data-theme', 'dark');
    } catch (e) {}
  })()
`;

export function isLocale(locale: string): locale is Locale {
  return locale === 'sv' || locale === 'en';
}

export function generateStaticParams() {
  return [{ locale: 'sv' }, { locale: 'en' }];
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  setRequestLocale(locale);
  return (
    <html lang={locale} className={fontClassNames} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={catalogs[locale]}>
          <ThemeProvider>
            <Preferences locale={locale} />
            {children}
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
