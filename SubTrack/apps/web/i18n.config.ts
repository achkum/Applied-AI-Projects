import { catalogs, type Locale } from '@subtrack/i18n';

export default {
  locales: ['sv', 'en'] as const,
  defaultLocale: 'sv' as Locale,
  localeDetection: true,
  messages: catalogs,
};
