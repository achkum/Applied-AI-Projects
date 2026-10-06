import { describe, expect, it, vi } from 'vitest';
import { catalogs, type Locale } from '@subtrack/i18n';

// The config callback is the unit under test; next-intl's request-context wrapper
// is an unrelated server bootstrap boundary and needs a live Next request context.
vi.mock('next-intl/server', () => ({
  getRequestConfig: (callback: unknown) => callback,
}));

import requestConfig from '../i18n/request';

type ResolvedRequestConfig = {
  locale: Locale;
  messages: (typeof catalogs)[Locale];
};

const runConfig = requestConfig as unknown as (context: {
  requestLocale: Promise<string | undefined>;
}) => Promise<ResolvedRequestConfig>;

describe('next-intl request configuration', () => {
  it.each([
    ['sv', 'sv'],
    ['en', 'en'],
  ] as const)('loads the %s catalogue when that locale is requested', async (requested, expected) => {
    const config = await runConfig({ requestLocale: Promise.resolve(requested) });

    expect(config.locale).toBe(expected);
    expect(config.messages).toBe(catalogs[expected]);
  });

  it.each([undefined, 'fr'] as const)('defaults missing or unsupported request locales (%s) to Swedish', async (requested) => {
    const config = await runConfig({ requestLocale: Promise.resolve(requested) });

    expect(config.locale).toBe('sv');
    expect(config.messages).toBe(catalogs.sv);
  });
});
