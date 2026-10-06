import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { catalogs } from '@subtrack/i18n';
import { axe } from 'jest-axe';
import { HomeScreen } from '../app/[locale]/home/home-screen';
import HomePage from '../app/[locale]/home/page';

afterEach(cleanup);

describe('localized mock Home route', () => {
  it('validates the locale on the async server route', async () => {
    const page = await HomePage({ params: Promise.resolve({ locale: 'sv' }) });
    expect(page.type).toBe(HomeScreen);
    await expect(HomePage({ params: Promise.resolve({ locale: 'fr' }) })).rejects.toBeDefined();
  });

  it('renders bilingual disclosures and the five fixed presentation rows', () => {
    for (const locale of ['sv', 'en'] as const) {
      const { unmount } = render(<HomeScreen locale={locale} />);
      expect(screen.getByRole('heading', { level: 1, name: catalogs[locale].home.totalHeading })).toBeTruthy();
      expect(screen.getByText(catalogs[locale].home.sampleCaption)).toBeTruthy();
      expect(screen.getByText(catalogs[locale].home.scopeDisclosure)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: catalogs[locale].orbit.viewAsList }));
      const list = screen.getByRole('region', { name: catalogs[locale].orbit.listLabel });
      expect(within(list).getAllByRole('button')).toHaveLength(3);
      fireEvent.click(screen.getByRole('radio', { name: catalogs[locale].navigation.household }));
      expect(within(list).getAllByRole('button')).toHaveLength(5);
      for (const name of ['Netflix', 'Spotify', 'GitHub', 'iCloud', 'HBO Max']) {
        expect(within(list).getByRole('button', { name: new RegExp(name) })).toBeTruthy();
      }
      unmount();
    }
  });

  it('keeps a hidden selected ID and restores it when the household scope returns', () => {
    render(<HomeScreen locale="en" />);
    fireEvent.click(screen.getByRole('button', { name: catalogs.en.orbit.viewAsList }));
    const list = screen.getByRole('region', { name: catalogs.en.orbit.listLabel });
    fireEvent.click(screen.getByRole('radio', { name: catalogs.en.navigation.household }));
    fireEvent.click(within(list).getByRole('button', { name: /iCloud/ }));
    expect(within(list).getByRole('button', { name: /iCloud/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: catalogs.en.scope.personal }));
    expect(within(list).queryByRole('button', { name: /iCloud/ })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: catalogs.en.navigation.household }));
    expect(within(list).getByRole('button', { name: /iCloud/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('uses the approved exact static totals for each scope and period', () => {
    render(<HomeScreen locale="en" />);
    const total = screen.getByRole('region', { name: catalogs.en.home.totalHeading });
    const expectAmount = (amount: string) => {
      expect(total.querySelector('[aria-live="polite"]')?.getAttribute('aria-label')).toBe(amount);
    };

    expectAmount('326\u00a0kr');
    fireEvent.click(within(total).getByRole('button', { name: catalogs.en.orbit.billingCadence.ANNUAL }));
    expectAmount('3\u00a0912\u00a0kr');
    fireEvent.click(screen.getByRole('radio', { name: catalogs.en.navigation.household }));
    expectAmount('5\u00a0688\u00a0kr');
    fireEvent.click(within(total).getByRole('button', { name: catalogs.en.orbit.billingCadence.MONTHLY }));
    expectAmount('474\u00a0kr');
    fireEvent.click(within(total).getByRole('button', { name: catalogs.en.orbit.billingCadence.ANNUAL }));
    expectAmount('5\u00a0688\u00a0kr');
  });

  it.each([
    ['sv', 'light'],
    ['sv', 'dark'],
    ['en', 'light'],
    ['en', 'dark'],
  ] as const)('has no accessibility violations for %s locale with %s theme', async (locale, theme) => {
    document.documentElement.dataset.theme = theme;
    const { container } = render(<HomeScreen locale={locale} />);
    expect((await axe(container)).violations).toHaveLength(0);
    delete document.documentElement.dataset.theme;
  });
});
