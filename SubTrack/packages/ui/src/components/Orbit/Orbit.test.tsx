import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { catalogs } from '@subtrack/i18n';
import type { Locale } from '@subtrack/i18n';
import { Orbit } from './Orbit';
import type { OrbitPresentation, OrbitSubscription } from './types';
import { buildPresentationById, DarkCanvas, Default, WithPresentationRender } from './Orbit.stories';
import { computeOrbitLayout, HIT_TARGET_REFERENCE_SIZE } from './orbitMath';

const SUBS: OrbitSubscription[] = [
  { id: 'a', name: 'Netflix', category: 'streaming',    ownerType: 'ME',        monthlyCostMinor: 13900, billingCadence: 'MONTHLY' },
  { id: 'b', name: 'iCloud',  category: 'cloud',        ownerType: 'HOUSEHOLD', monthlyCostMinor:  2900, billingCadence: 'MONTHLY' },
];

const INVALID_PRESENTATION_ERROR =
  'Orbit requires a valid locale and nonblank presentation for every subscription when presentationById is provided.';

function mockReducedMotion(initial: boolean) {
  let reduced = initial;
  const listeners = new Set<() => void>();
  const previous = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (media: string) => ({
      matches: reduced,
      media,
      onchange: null,
      addEventListener: (_event: string, listener: () => void) => { listeners.add(listener); },
      removeEventListener: (_event: string, listener: () => void) => { listeners.delete(listener); },
      addListener: (listener: () => void) => { listeners.add(listener); },
      removeListener: (listener: () => void) => { listeners.delete(listener); },
      dispatchEvent: () => true,
    } as unknown as MediaQueryList),
  });

  return {
    set(value: boolean) {
      reduced = value;
      listeners.forEach((listener) => listener());
    },
    restore() {
      if (previous) Object.defineProperty(window, 'matchMedia', previous);
      else Reflect.deleteProperty(window, 'matchMedia');
    },
  };
}

const PRESENTATION_SUBS = Default.args?.subscriptions;

function getPresentationFixture(locale: Locale): {
  subscriptions: OrbitSubscription[];
  presentationById: Record<string, OrbitPresentation>;
} {
  if (!PRESENTATION_SUBS) throw new Error('Default Orbit fixture is required.');
  return {
    subscriptions: PRESENTATION_SUBS,
    presentationById: buildPresentationById(locale),
  };
}

describe('Orbit component (SSR smoke tests)', () => {
  it('renders without throwing', () => {
    expect(() => renderToString(<Orbit subscriptions={SUBS} />)).not.toThrow();
  });

  it('includes an accessible list item for each subscription', () => {
    const html = renderToString(<Orbit subscriptions={SUBS} />);
    expect(html).toContain('Netflix');
    expect(html).toContain('iCloud');
  });

  it('renders the SVG element', () => {
    const html = renderToString(<Orbit subscriptions={SUBS} />);
    expect(html).toContain('<svg');
  });

  it('applies the provided ariaLabel', () => {
    const html = renderToString(<Orbit subscriptions={SUBS} ariaLabel="Test orbit" />);
    expect(html).toContain('Test orbit');
  });

  it('renders empty state without throwing', () => {
    expect(() => renderToString(<Orbit subscriptions={[]} />)).not.toThrow();
  });

  it('renders a decorative, hidden line-art constellation when empty', () => {
    const html = renderToString(<Orbit subscriptions={[]} ariaLabel="Empty orbit" />);
    expect(html).toContain('aria-label="Empty orbit"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('M196 250 246 202 292 238 346 184 402 224 456 190');
    expect(html).not.toContain('role="button"');
  });

  it('sets the DarkCanvas story theme global to dark', () => {
    expect(DarkCanvas.globals).toEqual({ theme: 'dark' });
  });

  it('keeps the current story hit targets from overlapping or stealing neighbouring clicks', () => {
    const subscriptions = Default.args?.subscriptions;
    if (!subscriptions) throw new Error('Default story subscriptions are required');
    const { bodies, size } = computeOrbitLayout(subscriptions);

    for (let first = 0; first < bodies.length; first += 1) {
      const body = bodies[first]!;
      const hitRadius = body.r * (size / HIT_TARGET_REFERENCE_SIZE);
      for (let second = first + 1; second < bodies.length; second += 1) {
        const other = bodies[second]!;
        const otherHitRadius = other.r * (size / HIT_TARGET_REFERENCE_SIZE);
        const distance = Math.hypot(body.cx - other.cx, body.cy - other.cy);
        expect(distance).toBeGreaterThanOrEqual(hitRadius + otherHitRadius);
      }
    }
  });

  it('maps the existing category names and unknown categories to generated token roles', () => {
    const categoryTokens = new Map([
      ['streaming', 'video-streaming'],
      ['fitness', 'fitness-wellness'],
      ['productivity', 'software-productivity'],
      ['gaming', 'gaming'],
      ['music', 'music-audio'],
      ['cloud', 'cloud-storage'],
      ['news', 'news-magazines'],
      ['other', 'other-subscription'],
      ['unmapped-category', 'other-subscription'],
    ]);

    for (const [category, token] of categoryTokens) {
      const subscription: OrbitSubscription = {
        ...SUBS[0]!,
        id: category,
        category,
      };
      const html = renderToString(<Orbit subscriptions={[subscription]} />);
      expect(html).toContain(`--body-color:var(--category-${token})`);
    }
  });

  it('marks active body with a stroke', () => {
    const html = renderToString(<Orbit subscriptions={SUBS} activeId="a" />);
    // The active circle gets strokeWidth=2
    expect(html).toContain('stroke-width="2"');
  });

  it('keeps click and keyboard selection on the transparent target with the original effective size', () => {
    const onBodySelect = vi.fn();
    render(<Orbit subscriptions={SUBS} onBodySelect={onBodySelect} />);
    const target = screen.getByRole('button', { name: 'Netflix' });
    expect(target.tagName.toLowerCase()).toBe('circle');
    const layout = computeOrbitLayout([SUBS[0]!]);
    expect(Number(target.getAttribute('r'))).toBeCloseTo(
      layout.bodies[0]!.r * (layout.size / HIT_TARGET_REFERENCE_SIZE),
      5,
    );

    fireEvent.click(target);
    expect(onBodySelect).toHaveBeenLastCalledWith('a');
    fireEvent.keyDown(target, { key: 'Enter' });
    expect(onBodySelect).toHaveBeenLastCalledWith('a');
    fireEvent.keyDown(target, { key: ' ' });
    expect(onBodySelect).toHaveBeenCalledTimes(3);
  });

  it('keeps the decorative opaque label plate out of selection and accessibility semantics', () => {
    const onBodySelect = vi.fn();
    const { container } = render(<Orbit subscriptions={SUBS} onBodySelect={onBodySelect} />);
    const plate = container.querySelector('rect[class*="bodyLabelPlate"]');
    const label = container.querySelector('text[class*="bodyLabel"]');
    const target = screen.getByRole('button', { name: 'Netflix' });

    expect(plate).toHaveAttribute('aria-hidden', 'true');
    expect(plate?.parentElement).toBe(label?.parentElement);
    expect(plate?.nextElementSibling).toBe(label);
    expect(plate?.parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(label).toHaveTextContent('Net');
    expect(target).toHaveAttribute('tabindex', '0');

    fireEvent.click(target);
    expect(onBodySelect).toHaveBeenCalledWith('a');
    fireEvent.keyDown(target, { key: 'Enter' });
    expect(onBodySelect).toHaveBeenCalledTimes(2);
  });
});

describe('Orbit enriched presentation mode', () => {
  it.each(['en', 'sv'] as const)(
    'renders complete %s host strings in stable input order',
    async (locale) => {
      const { subscriptions, presentationById } = getPresentationFixture(locale);
      const { container } = render(
        <WithPresentationRender subscriptions={subscriptions} locale={locale} />,
      );
      const catalog = catalogs[locale];
      const region = screen.getByRole('region', { name: catalog.orbit.listLabel });
      const rows = within(region).getAllByRole('listitem');

      expect(screen.getByRole('figure', { name: catalog.orbit.ariaLabel })).toBeInTheDocument();
      const modeButton = screen.getByRole('button', { name: catalog.orbit.viewAsList });
      expect(modeButton).toHaveAttribute('aria-pressed', 'false');
      expect(container.querySelector('svg text')?.textContent).toBe(catalog.orbit.centreMeLabel);
      expect(rows).toHaveLength(subscriptions.length);

      const expectedAmounts: Record<string, string> = {
        netflix: '139\u00a0kr', spotify: '99\u00a0kr', gh: '88\u00a0kr', icloud: '29\u00a0kr',
        hbo: '119\u00a0kr', peloton: '449\u00a0kr', xbox: '89\u00a0kr', nytimes: '17\u00a0kr',
      };
      subscriptions.forEach((subscription, index) => {
        const row = rows[index];
        const presentation = presentationById[subscription.id];
        if (!row || !presentation) throw new Error(`Missing Orbit row fixture ${subscription.id}.`);
        expect(within(row).getByText(subscription.name)).toBeInTheDocument();
        expect(within(row).getByText(presentation.categoryLabel)).toBeInTheDocument();
        expect(within(row).getByText(presentation.amountLabel, { normalizer: (text) => text }).textContent)
          .toBe(`${expectedAmounts[subscription.id]} ${catalog.orbit.monthlyEquivalent}`);
        expect(within(row).getByText(presentation.cadenceLabel)).toBeInTheDocument();
        expect(within(row).getByText(presentation.ownerLabel)).toBeInTheDocument();
      });

      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg?.querySelector('[role], [tabindex]')).toBeNull();
      expect(await axe(container)).toHaveNoViolations();
      await userEvent.click(modeButton);
      expect(modeButton).toHaveAttribute('aria-pressed', 'true');
      expect(svg).toHaveAttribute('data-list-mode', 'true');
      expect(await axe(container)).toHaveNoViolations();
    },
  );

  it('ignores presentation entries for subscriptions that are not displayed', () => {
    const { subscriptions, presentationById } = getPresentationFixture('en');
    const netflix = presentationById.netflix;
    if (!netflix) throw new Error('Netflix presentation fixture is required.');
    presentationById.extra = netflix;
    const { container } = render(
      <Orbit subscriptions={subscriptions} locale="en" presentationById={presentationById} />,
    );
    expect(within(screen.getByRole('region', { name: 'Subscriptions' })).getAllByRole('listitem'))
      .toHaveLength(subscriptions.length);
    expect(container.querySelectorAll('[data-subscription-id="extra"]')).toHaveLength(0);
  });

  it('fails consistently for missing locale, missing rows, or blank host labels', () => {
    const { subscriptions, presentationById } = getPresentationFixture('en');
    const incomplete = { ...presentationById };
    delete incomplete.netflix;
    const validNetflix = presentationById.netflix;
    if (!validNetflix) throw new Error('Netflix presentation fixture is required.');
    const invalidMaps = (['categoryLabel', 'amountLabel', 'cadenceLabel', 'ownerLabel'] as const).map(
      (field) => ({
        ...presentationById,
        netflix: { ...validNetflix, [field]: '  ' },
      }),
    );

    const invalidInputs: Array<{
      locale: Locale | undefined;
      map: Readonly<Record<string, OrbitPresentation>>;
    }> = [
      { locale: undefined, map: presentationById },
      { locale: 'fr' as Locale, map: presentationById },
      { locale: 'en', map: incomplete },
      ...invalidMaps.map((map) => ({ locale: 'en' as const, map })),
    ];

    invalidInputs.forEach(({ locale, map }) => {
      expect(() => renderToString(
        <Orbit subscriptions={subscriptions} locale={locale} presentationById={map} />,
      )).toThrow(INVALID_PRESENTATION_ERROR);
    });
  });

  it('keeps list and pointer selection on their original stable IDs', async () => {
    const user = userEvent.setup();
    const onBodySelect = vi.fn();
    const { subscriptions } = getPresentationFixture('en');
    const { container } = render(
      <WithPresentationRender
        subscriptions={subscriptions}
        locale="en"
        onBodySelect={onBodySelect}
      />,
    );
    const toggle = screen.getByRole('button', { name: 'View as list' });
    const netflix = screen.getByRole('button', { name: /Netflix/ });
    const spotify = screen.getByRole('button', { name: /Spotify/ });
    expect(netflix).toHaveAttribute('aria-pressed', 'false');

    const pointerTarget = container.querySelector('circle[data-subscription-id="xbox"]');
    if (!pointerTarget) throw new Error('Expected the Xbox pointer target.');
    fireEvent.click(pointerTarget);
    expect(onBodySelect).toHaveBeenLastCalledWith('xbox');
    expect(screen.getByRole('button', { name: /Xbox GP/ })).toHaveAttribute('aria-pressed', 'true');

    await user.tab();
    expect(toggle).toHaveFocus();
    await user.tab();
    expect(netflix).toHaveFocus();
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard('{Enter}');
    expect(onBodySelect).toHaveBeenLastCalledWith('netflix');
    await user.keyboard(' ');
    expect(onBodySelect).toHaveBeenCalledTimes(3);

    await user.click(spotify);
    expect(onBodySelect).toHaveBeenLastCalledWith('spotify');
    expect(spotify).toHaveAttribute('aria-pressed', 'true');
    expect(onBodySelect).toHaveBeenCalledTimes(4);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('starts in reduced-motion list mode and preserves the chosen mode and selected ID', () => {
    const media = mockReducedMotion(true);
    try {
      const { subscriptions } = getPresentationFixture('en');
      const { container } = render(
        <Orbit
          subscriptions={subscriptions}
          locale="en"
          activeId="spotify"
          presentationById={buildPresentationById('en')}
        />,
      );
      const toggle = screen.getByRole('button', { name: 'View as list' });
      expect(toggle).toHaveAttribute('aria-pressed', 'true');
      expect(toggle).toBeDisabled();
      expect(screen.getByRole('button', { name: /Spotify/ })).toHaveAttribute('aria-pressed', 'true');
      expect(container.querySelector('svg')).toHaveAttribute('data-list-mode', 'true');

      act(() => media.set(false));
      expect(toggle).toHaveAttribute('aria-pressed', 'false');
      fireEvent.click(toggle);
      act(() => media.set(true));
      expect(toggle).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: /Spotify/ })).toHaveAttribute('aria-pressed', 'true');
      act(() => media.set(false));
      expect(toggle).toHaveAttribute('aria-pressed', 'true');
    } finally {
      media.restore();
    }
  });
});
