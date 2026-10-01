import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { Orbit } from './Orbit';
import type { OrbitSubscription } from './types';

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

  it('marks active body with a stroke', () => {
    const html = renderToString(<Orbit subscriptions={SUBS} activeId="a" />);
    // The active circle gets strokeWidth=2
    expect(html).toContain('stroke-width="2"');
  });
});
