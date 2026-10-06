import { catalogs, type Locale } from '@subtrack/i18n';
import { getRequestConfig } from 'next-intl/server';

function isLocale(locale: string | undefined): locale is Locale {
  return locale === 'sv' || locale === 'en';
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requestedLocale = await requestLocale;
  const locale = isLocale(requestedLocale) ? requestedLocale : 'sv';

  return {
    locale,
    messages: catalogs[locale],
  };
});
