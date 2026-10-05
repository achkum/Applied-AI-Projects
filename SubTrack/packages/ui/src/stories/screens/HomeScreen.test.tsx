import React from 'react';
import { add, money, multiply } from '@subtrack/money';
import { axe } from 'jest-axe';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { catalogs } from '@subtrack/i18n';
import type { Locale } from '@subtrack/i18n';
import { SAMPLE_SUBS } from '../fixtures/orbitSubscriptions';
import { buildPresentationById } from '../../components/Orbit/Orbit.stories';
import meta, { EnDark, EnLight, SvDark, SvLight } from './HomeScreen.stories';
import { HomeScreen } from './HomeScreen';

const states = [
  { locale: 'sv' as const, theme: 'light', story: SvLight },
  { locale: 'sv' as const, theme: 'dark', story: SvDark },
  { locale: 'en' as const, theme: 'light', story: EnLight },
  { locale: 'en' as const, theme: 'dark', story: EnDark },
];
const moneyLocale: Record<Locale, string> = { sv: 'sv-SE', en: 'en-SE' };
const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  configurable: true,
  value: vi.fn(),
});
afterAll(() => {
  if (originalScroll) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScroll);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
});

function formatted(minor: number, locale: Locale) {
  return new Intl.NumberFormat(moneyLocale[locale], {
    style: 'currency', currency: 'SEK', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(minor / 100);
}

describe('Home hero composition', () => {
  it.each(states)('renders actual $locale/$theme story copy and theme', async ({ locale, theme, story }) => {
    const catalog = catalogs[locale];
    expect(meta.id).toBe('screens-home');
    expect(meta.title).toBe('Screens/Home');
    expect(story.args?.locale).toBe(locale);
    expect(story.globals?.theme).toBe(theme);
    const { container } = render(<div data-theme={theme}><HomeScreen locale={locale} /></div>);
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: catalog.home.totalHeading })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: catalog.scopeSwitcher.groupLabel })).toBeInTheDocument();
    expect(screen.getByRole('figure', { name: catalog.orbit.ariaLabel })).toBeInTheDocument();
    expect(screen.getByText(catalog.home.sampleCaption)).toBeInTheDocument();
    expect(story.parameters?.docs?.description?.story).toBe(catalog.home.scopeDisclosure);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('keeps the exact Orbit fixture and proves both fixed totals with public money operations', () => {
    expect(SAMPLE_SUBS.map(({ id }) => id)).toEqual([
      'netflix', 'spotify', 'gh', 'icloud', 'hbo', 'peloton', 'xbox', 'nytimes',
    ]);
    const sum = (ids: string[]) => SAMPLE_SUBS
      .filter(({ id }) => ids.includes(id))
      .reduce((total, subscription) => add(total, money(subscription.monthlyCostMinor, 'SEK')), money(0, 'SEK'));
    const me = sum(['netflix', 'spotify', 'gh']);
    const household = sum(['netflix', 'spotify', 'gh', 'icloud', 'hbo']);
    expect(me).toEqual(money(32600, 'SEK'));
    expect(household).toEqual(money(47400, 'SEK'));
    expect(multiply(me, 12n)).toEqual(money(391200, 'SEK'));
    expect(multiply(household, 12n)).toEqual(money(568800, 'SEK'));
    expect(SAMPLE_SUBS.find(({ id }) => id === 'gh')?.billingCadence).toBe('ANNUAL');
  });

  it.each([{ locale: 'en' as const, month: 'Monthly', annual: 'Annual' },
    { locale: 'sv' as const, month: 'Månadsvis', annual: 'Årsvis' }])(
    'shows the $locale monthly equivalent and explicit 12-month projection', async ({ locale, month, annual }) => {
      const user = userEvent.setup();
      render(<HomeScreen locale={locale} />);
      expect(await screen.findByText(formatted(32600, locale), { normalizer: (text) => text })).toBeInTheDocument();
      expect(screen.getByText(catalogs[locale].orbit.monthlyEquivalent)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: annual }));
      expect(await screen.findByText(formatted(391200, locale), { normalizer: (text) => text })).toBeInTheDocument();
      expect(screen.getByText(catalogs[locale].home.projection12Months)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: month }));
      await user.click(screen.getByRole('radio', { name: catalogs[locale].navigation.household }));
      expect(await screen.findByText(formatted(47400, locale), { normalizer: (text) => text })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: annual }));
      expect(await screen.findByText(formatted(568800, locale), { normalizer: (text) => text })).toBeInTheDocument();
      expect(screen.getByText(catalogs[locale].home.projection12Months)).toBeInTheDocument();
    },
  );

  it.each(['en', 'sv'] as const)(
    'shows only the two stated scopes and keeps list and pointer selection on the same ID in %s',
    async (locale) => {
    const user = userEvent.setup();
    const catalog = catalogs[locale];
    const { container } = render(<HomeScreen locale={locale} />);
    const me = catalog.scope.personal;
    const household = catalog.navigation.household;
    expect(screen.getByRole('radio', { name: me })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('region', { name: catalog.orbit.listLabel })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: catalog.orbit.viewAsList }));
    const region = screen.getByRole('region', { name: catalog.orbit.listLabel });
    const rows = within(region).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    const expected = buildPresentationById(locale);
    for (const [index, subscription] of SAMPLE_SUBS.slice(0, 3).entries()) {
      const row = rows[index];
      const presentation = expected[subscription.id];
      if (!row || !presentation) throw new Error(`Missing visible Home presentation ${subscription.id}.`);
      expect(within(row).getByText(subscription.name)).toBeInTheDocument();
      expect(within(row).getByText(presentation.categoryLabel)).toBeInTheDocument();
      expect(within(row).getByText(presentation.amountLabel, { normalizer: (text) => text })).toBeInTheDocument();
      expect(within(row).getByText(presentation.cadenceLabel)).toBeInTheDocument();
      expect(within(row).getByText(presentation.ownerLabel)).toBeInTheDocument();
    }
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: household }));
    const householdRows = within(region).getAllByRole('listitem');
    expect(householdRows).toHaveLength(5);
    for (const [index, subscription] of SAMPLE_SUBS.slice(0, 5).entries()) {
      const row = householdRows[index];
      const presentation = expected[subscription.id];
      if (!row || !presentation) throw new Error(`Missing visible Home presentation ${subscription.id}.`);
      expect(within(row).getByText(subscription.name)).toBeInTheDocument();
      expect(within(row).getByText(presentation.categoryLabel)).toBeInTheDocument();
      expect(within(row).getByText(presentation.amountLabel, { normalizer: (text) => text })).toBeInTheDocument();
      expect(within(row).getByText(presentation.cadenceLabel)).toBeInTheDocument();
      expect(within(row).getByText(presentation.ownerLabel)).toBeInTheDocument();
    }
    const icloudRow = within(region).getByRole('button', { name: /iCloud/ });
    await user.click(icloudRow);
    expect(icloudRow).toHaveAttribute('aria-pressed', 'true');
    const pointerTarget = container.querySelector('[data-subscription-id="hbo"]');
    if (!pointerTarget) throw new Error('Expected the HBO stable-ID pointer target.');
    fireEvent.click(pointerTarget);
    expect(within(region).getByRole('button', { name: /HBO Max/ })).toHaveAttribute('aria-pressed', 'true');
    expect(await axe(container)).toHaveNoViolations();
    await user.click(screen.getByRole('radio', { name: me }));
    expect(within(region).getAllByRole('listitem')).toHaveLength(3);
    expect(within(region).getAllByRole('button').filter((button) => button.getAttribute('aria-pressed') === 'true'))
      .toHaveLength(0);
    await user.click(screen.getByRole('radio', { name: household }));
    expect(within(region).getByRole('button', { name: /HBO Max/ })).toHaveAttribute('aria-pressed', 'true');
    },
  );

  it('starts with the semantic list under reduced motion and retains the active stable ID', () => {
    const previous = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    });
    try {
      const { container } = render(<HomeScreen locale="sv" />);
      const mode = screen.getByRole('button', { name: catalogs.sv.orbit.viewAsList });
      expect(mode).toBeDisabled();
      const orbitFigure = screen.getByRole('figure', { name: catalogs.sv.orbit.ariaLabel });
      expect(orbitFigure.querySelector('svg')).toHaveAttribute('data-list-mode', 'true');
      expect(container.querySelector('[data-subscription-id="netflix"]')).toBeInTheDocument();
    } finally {
      if (previous) Object.defineProperty(window, 'matchMedia', previous);
      else Reflect.deleteProperty(window, 'matchMedia');
    }
  });
});
