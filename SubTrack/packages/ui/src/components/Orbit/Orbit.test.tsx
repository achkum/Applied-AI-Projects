import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Orbit } from './Orbit';
import type { OrbitSubscription } from './types';
import { DarkCanvas, Default } from './Orbit.stories';
import { computeOrbitLayout, HIT_TARGET_REFERENCE_SIZE } from './orbitMath';

const SUBS: OrbitSubscription[] = [
  { id: 'a', name: 'Netflix', category: 'streaming',    ownerType: 'ME',        monthlyCostMinor: 13900, billingCadence: 'MONTHLY' },
  { id: 'b', name: 'iCloud',  category: 'cloud',        ownerType: 'HOUSEHOLD', monthlyCostMinor:  2900, billingCadence: 'MONTHLY' },
];

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
});
