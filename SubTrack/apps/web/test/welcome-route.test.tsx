import { render, screen, cleanup } from '@testing-library/react';
import { axe } from 'jest-axe';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogs, type Locale } from '@subtrack/i18n';
import WelcomePage from '../app/[locale]/page';
import LocaleLayout, { generateStaticParams } from '../app/[locale]/layout';

vi.mock('next/font/local', () => ({ default: () => ({ variable: 'font-variable' }) }));
vi.mock('next-intl/server', () => ({ setRequestLocale: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
});

describe('Welcome route', () => {
  it.each([
    ['sv', 'light'],
    ['sv', 'dark'],
    ['en', 'light'],
    ['en', 'dark'],
  ] as const)('renders %s in %s theme with accessible server copy', async (locale, theme) => {
    document.documentElement.dataset.theme = theme;
    const route = await WelcomePage({ params: Promise.resolve({ locale }) });
    const { container } = render(route);

    expect(screen.getByRole('heading', { level: 1, name: 'SubTrack' })).toBeTruthy();
    expect(screen.getByText(catalogs[locale].onboarding.welcome.tagline)).toBeTruthy();
    expect((await axe(container)).violations).toHaveLength(0);
  });

  it.each(['sv', 'en'] as const)('uses %s as the document language in its async root layout', async (locale: Locale) => {
    const root = await LocaleLayout({
      children: <main>Welcome</main>,
      params: Promise.resolve({ locale }),
    });

    expect(root.props.lang).toBe(locale);
    expect(root.props.children[1].type).toBe('body');
  });

  it('rejects unsupported locale segments', async () => {
    await expect(
      LocaleLayout({ children: <main>Welcome</main>, params: Promise.resolve({ locale: 'fr' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it.each(['fr', 'de'] as const)('renders no Welcome content for unsupported %s page segments', async (locale) => {
    const route = await WelcomePage({ params: Promise.resolve({ locale }) });
    const { container } = render(route);

    expect(container.childElementCount).toBe(0);
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('generates static params for both supported locales', () => {
    expect(generateStaticParams()).toEqual([{ locale: 'sv' }, { locale: 'en' }]);
  });
});
