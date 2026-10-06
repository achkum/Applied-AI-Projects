import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { axe } from 'jest-axe';
import demoFixture from '@subtrack/ui/demo-fixture';
import { catalogs } from '@subtrack/i18n';
import DemoPage from '../app/[locale]/demo/page';
import { DemoScreen } from '../app/[locale]/demo/demo-screen';

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
}));

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
});

describe('localized Lindqvist demo route', () => {
  it('validates locale segments and returns the screen for supported locales', async () => {
    const page = await DemoPage({ params: Promise.resolve({ locale: 'sv' }) });
    expect(page.type).toBe(DemoScreen);
    await expect(DemoPage({ params: Promise.resolve({ locale: 'fr' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it.each(['sv', 'en'] as const)('shows all original fictional subscriptions and exact formatted amounts in %s', (locale) => {
    render(<DemoScreen locale={locale} />);
    const catalog = catalogs[locale].demo;
    expect(screen.getByText(catalog.eyebrow)).toBeTruthy();
    expect(screen.getByText(catalog.disclosure)).toBeTruthy();
    expect(screen.getByRole('link', { name: catalog.returnToWelcome }).getAttribute('href')).toBe(`/${locale}`);
    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(6);
    for (const [index, subscription] of demoFixture.subscriptions.entries()) {
      const row = within(list).getAllByRole('listitem')[index];
      expect(row).toBeTruthy();
      if (!row) throw new Error('Expected fixture row to render');
      expect(within(row).getByText(subscription.merchantName)).toBeTruthy();
      expect(row.textContent).toContain(subscription.displayAmount[locale]);
      expect(row.textContent).toContain(catalog.cadence[subscription.billingCadence as 'MONTHLY' | 'ANNUAL']);
    }
    expect(screen.queryByText(/total|totalt|projection|prognos/i)).toBeNull();
  });

  it.each([
    ['sv', 'light'], ['sv', 'dark'], ['en', 'light'], ['en', 'dark'],
  ] as const)('has no accessibility violations in %s locale and %s theme', async (locale, theme) => {
    document.documentElement.dataset.theme = theme;
    const { container } = render(<DemoScreen locale={locale} />);
    expect((await axe(container)).violations).toHaveLength(0);
  });

  it.each(['sv', 'en'] as const)('uses a localized unavailable label when a display string is missing in %s', (locale) => {
    const fixture = structuredClone(demoFixture);
    const firstSubscription = fixture.subscriptions[0];
    expect(firstSubscription).toBeDefined();
    if (!firstSubscription) throw new Error('Expected demo fixture subscription');
    firstSubscription.displayAmount[locale] = '';
    render(<DemoScreen locale={locale} fixture={fixture} />);
    const unavailable = screen.getByText(catalogs[locale].demo.amountUnavailable);
    expect(unavailable.parentElement?.textContent).not.toMatch(/[0-9]/);
  });
});
