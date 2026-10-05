import React from 'react';
import { axe } from 'jest-axe';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Locale } from '@subtrack/i18n';
import meta, { EnDark, EnLight, SvDark, SvLight } from './SubscriptionDetailScreen.stories';
import { SubscriptionDetailScreen } from './SubscriptionDetailScreen';

const states = [
  { locale: 'sv' as const, theme: 'light', story: SvLight, heading: 'Prenumerationsdetalj', cadence: 'per månad', history: 'Prishistorik' },
  { locale: 'sv' as const, theme: 'dark', story: SvDark, heading: 'Prenumerationsdetalj', cadence: 'per månad', history: 'Prishistorik' },
  { locale: 'en' as const, theme: 'light', story: EnLight, heading: 'Subscription detail', cadence: 'per month', history: 'Price history' },
  { locale: 'en' as const, theme: 'dark', story: EnDark, heading: 'Subscription detail', cadence: 'per month', history: 'Price history' },
];

const moneyLocales: Record<Locale, string> = { sv: 'sv-SE', en: 'en-SE' };

describe('Subscription detail hero composition', () => {
  it.each(states)(
    'renders the $locale/$theme story with localized labels and accepted fixture',
    async ({ locale, theme, story, heading, cadence, history }) => {
      expect(meta.id).toBe('screens-subscription-detail');
      expect(meta.title).toBe('Screens/Subscription Detail');
      expect(story.args?.locale).toBe(locale);
      expect(story.globals?.theme).toBe(theme);

      const { container } = render(
        <div data-theme={theme}>
          <SubscriptionDetailScreen locale={locale} />
        </div>,
      );
      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: 'Spotify' })).toBeInTheDocument();
      expect(screen.getByText(cadence)).toBeInTheDocument();
      expect(screen.getByText(history)).toBeInTheDocument();

      const formattedPrice = new Intl.NumberFormat(moneyLocales[locale], {
        style: 'currency', currency: 'SEK', minimumFractionDigits: 0, maximumFractionDigits: 0,
      }).format(109);
      expect(screen.getByText(formattedPrice, { normalizer: (text) => text })).toBeInTheDocument();
      const receipt = screen.getByRole('article');
      expect(receipt).toHaveStyle({ borderTopColor: 'var(--category-music-audio)' });
      expect(await axe(container)).toHaveNoViolations();
    },
  );
});
