import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { catalogs } from '@subtrack/i18n';
import SubscriptionPage from '../app/[locale]/subscriptions/[id]/page';
import { SubscriptionDetail } from '../app/[locale]/subscriptions/[id]/subscription-detail';
import { Preferences } from '../components/preferences/preferences';

const navigation = vi.hoisted(() => ({ pathname: '/sv/subscriptions/spotify' }));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
  usePathname: () => navigation.pathname,
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
});
beforeEach(() => {
  localStorage.clear();
  window.matchMedia = (query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  });
});

describe('approved subscription detail route', () => {
  it.each(['sv', 'en'] as const)('validates async params and renders the Spotify fixture in %s', async (locale) => {
    const page = await SubscriptionPage({ params: Promise.resolve({ locale, id: 'spotify' }) });
    expect(page.type).toBe(SubscriptionDetail);
    render(page);
    expect(screen.getByRole('heading', { level: 1, name: catalogs[locale].hero.subscriptionDetail.title })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Spotify' })).toBeTruthy();
    expect(screen.getByText(catalogs[locale].hero.subscriptionDetail.cadenceMonthly)).toBeTruthy();
    expect(screen.getByText(catalogs[locale].home.sampleCaption)).toBeTruthy();
    fireEvent.click(screen.getByText(catalogs[locale].hero.subscriptionDetail.priceHistory));
    const historyRows = [
      '2024-09: 99 kr',
      '2024-12: 99 kr',
      '2025-03: 99 kr',
      '2025-06: 109 kr',
      '2025-09: 109 kr',
    ];
    const article = screen.getByRole('heading', { level: 2, name: 'Spotify' }).closest('article');
    expect(Array.from(article?.querySelectorAll('li') ?? [], (row) => row.textContent)).toEqual(historyRows);
    expect(screen.getByText((_, element) => element?.tagName === 'SPAN' && element.textContent === '109\u00a0kr').textContent).toBe('109 kr');
  });

  it.each([
    ['sv', 'light'], ['sv', 'dark'], ['en', 'light'], ['en', 'dark'],
  ] as const)('has no accessibility violations for %s in %s theme', async (locale, theme) => {
    document.documentElement.dataset.theme = theme;
    const { container } = render(<SubscriptionDetail locale={locale} />);
    expect((await axe(container)).violations).toHaveLength(0);
  });

  it.each([
    ['fr', 'spotify'], ['sv', 'unknown'], ['en', 'netflix'],
  ])('404s for unsupported locale/id %s/%s', async (locale, id) => {
    await expect(SubscriptionPage({ params: Promise.resolve({ locale, id }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('shared preferences', () => {
  it.each([
    ['sv', '/en/subscriptions/spotify'], ['en', '/sv/home'],
  ] as const)('preserves the current route when changing locale from %s', (locale, expectedHref) => {
    navigation.pathname = locale === 'sv' ? '/sv/subscriptions/spotify' : '/en/home';
    render(<Preferences locale={locale} />);
    expect(screen.getByRole('link').getAttribute('href')).toBe(expectedHref);
  });

  it('applies and stores native light, dark, and system choices with the pressed state', () => {
    render(<Preferences locale="en" />);
    const button = (theme: 'light' | 'dark' | 'system') =>
      screen.getByRole('button', { name: catalogs.en.preferences.themes[theme] });

    fireEvent.click(button('light'));
    expect(localStorage.getItem('theme-preference')).toBe('light');
    expect(button('light').getAttribute('aria-pressed')).toBe('true');
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();

    fireEvent.click(button('dark'));
    expect(localStorage.getItem('theme-preference')).toBe('dark');
    expect(button('dark').getAttribute('aria-pressed')).toBe('true');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    fireEvent.click(button('system'));
    expect(localStorage.getItem('theme-preference')).toBe('system');
    expect(button('system').getAttribute('aria-pressed')).toBe('true');
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();

    cleanup();
    render(<Preferences locale="en" />);
    expect(button('system').getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('theme-preference')).toBe('system');
  });

  it.each(['sv', 'en'] as const)('has no accessibility violations for preferences in %s', async (locale) => {
    const { container } = render(<Preferences locale={locale} />);
    expect((await axe(container)).violations).toHaveLength(0);
  });
});
