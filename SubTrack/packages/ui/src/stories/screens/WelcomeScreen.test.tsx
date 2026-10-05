import React from 'react';
import { axe } from 'jest-axe';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import meta, {
  EnDark,
  EnLight,
  ReducedMotion,
  SvDark,
  SvLight,
} from './WelcomeScreen.stories';
import { WelcomeScreen } from './WelcomeScreen';
import type { Locale } from '@subtrack/i18n';

const taglines: Record<Locale, string> = {
  en: 'Everything you subscribe to. In one place.',
  sv: 'Allt ni prenumererar på. På ett ställe.',
};

const states = [
  { locale: 'en' as const, theme: 'light', story: EnLight },
  { locale: 'en' as const, theme: 'dark', story: EnDark },
  { locale: 'sv' as const, theme: 'light', story: SvLight },
  { locale: 'sv' as const, theme: 'dark', story: SvDark },
];

describe('Welcome hero composition', () => {
  it.each(states)(
    'renders the $locale/$theme story with its exact catalog tagline and main landmark',
    async ({ locale, theme, story }) => {
      expect(meta.id).toBe('screens-welcome');
      expect(story.args?.locale).toBe(locale);
      expect(story.globals?.theme).toBe(theme);
      const { container } = render(
        <WelcomeScreen {...story.args} locale={locale} />,
      );

      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: 'SubTrack' })).toBeInTheDocument();
      expect(screen.getByText(taglines[locale])).toBeInTheDocument();
      expect(await axe(container)).toHaveNoViolations();
    },
  );

  it('provides an explicit reduced-motion variant and no nonfunctional actions', () => {
    expect(ReducedMotion.args?.reducedMotion).toBe(true);
    expect(ReducedMotion.globals?.theme).toBe('dark');
    const { container } = render(
      <WelcomeScreen locale="sv" reducedMotion={ReducedMotion.args?.reducedMotion} />,
    );

    expect(container.querySelector('[data-reduced-motion="true"]')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
