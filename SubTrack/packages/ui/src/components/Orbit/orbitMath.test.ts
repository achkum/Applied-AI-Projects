import { describe, it, expect } from 'vitest';
import {
  radiusFromCost,
  ringIndex,
  anglesForCadence,
  toCartesian,
  computeOrbitLayout,
} from './orbitMath';
import type { OrbitSubscription } from './types';

// ─── radiusFromCost ───────────────────────────────────────────────────────────
describe('radiusFromCost', () => {
  it('clamps to MIN_BODY_R for zero cost', () => {
    expect(radiusFromCost(0, [0, 10000])).toBe(10);
  });

  it('returns MAX_BODY_R for the highest cost', () => {
    expect(radiusFromCost(10000, [10000])).toBe(28);
  });

  it('scales midpoint to roughly mid-range', () => {
    const r = radiusFromCost(2500, [0, 10000]); // sqrt(0.25)=0.5 → 10+0.5*18=19
    expect(r).toBeCloseTo(19, 0);
  });
});

// ─── ringIndex ────────────────────────────────────────────────────────────────
describe('ringIndex', () => {
  const sub = (ownerType: OrbitSubscription['ownerType'], memberId?: string) =>
    ({ ownerType, memberId } as OrbitSubscription);

  it('assigns ring 0 to ME', () => {
    expect(ringIndex(sub('ME'), [])).toBe(0);
  });

  it('assigns ring 1 to HOUSEHOLD', () => {
    expect(ringIndex(sub('HOUSEHOLD'), [])).toBe(1);
  });

  it('assigns ring 2 to first member, 3 to second', () => {
    const order = ['alice', 'bob'];
    expect(ringIndex(sub('MEMBER', 'alice'), order)).toBe(2);
    expect(ringIndex(sub('MEMBER', 'bob'), order)).toBe(3);
  });

  it('assigns ring 2 for unknown memberId (clamps to 0)', () => {
    expect(ringIndex(sub('MEMBER', 'nobody'), ['alice'])).toBe(2);
  });
});

// ─── anglesForCadence ─────────────────────────────────────────────────────────
describe('anglesForCadence', () => {
  it('returns empty array for count=0', () => {
    expect(anglesForCadence(0, 'MONTHLY')).toEqual([]);
  });

  it('centres single MONTHLY body at π/2 (right quarter of top half)', () => {
    const [angle] = anglesForCadence(1, 'MONTHLY');
    expect(angle).toBeCloseTo(Math.PI / 2, 5);
  });

  it('centres single ANNUAL body at 3π/2', () => {
    const [angle] = anglesForCadence(1, 'ANNUAL');
    expect(angle).toBeCloseTo((3 * Math.PI) / 2, 5);
  });

  it('spreads two MONTHLY bodies across 0..π', () => {
    const [a, b] = anglesForCadence(2, 'MONTHLY');
    expect(a).toBeCloseTo(0, 5);
    expect(b).toBeCloseTo(Math.PI, 5);
  });
});

// ─── toCartesian ──────────────────────────────────────────────────────────────
describe('toCartesian', () => {
  it('places ring 0 at angle 0 directly above centre', () => {
    const { x, y } = toCartesian(0, 0); // straight up
    expect(x).toBeCloseTo(240, 1);      // cx=240, sin(0)=0
    expect(y).toBeCloseTo(240 - 72, 1); // cy - RING_RADII[0]
  });

  it('places ring 0 at angle π/2 to the right of centre', () => {
    const { x, y } = toCartesian(0, Math.PI / 2);
    expect(x).toBeCloseTo(240 + 72, 1); // cx + r
    expect(y).toBeCloseTo(240, 1);
  });
});

// ─── computeOrbitLayout ───────────────────────────────────────────────────────
describe('computeOrbitLayout', () => {
  const subs: OrbitSubscription[] = [
    { id: 's1', name: 'Netflix', category: 'streaming', ownerType: 'ME',        monthlyCostMinor: 10000, billingCadence: 'MONTHLY' },
    { id: 's2', name: 'iCloud',  category: 'cloud',     ownerType: 'HOUSEHOLD', monthlyCostMinor:  5000, billingCadence: 'MONTHLY' },
    { id: 's3', name: 'Peloton', category: 'fitness',   ownerType: 'MEMBER', memberId: 'alice', monthlyCostMinor: 8000, billingCadence: 'ANNUAL' },
  ];

  it('returns a body for each subscription', () => {
    const { bodies } = computeOrbitLayout(subs);
    expect(bodies).toHaveLength(3);
  });

  it('assigns correct rings', () => {
    const { bodies } = computeOrbitLayout(subs);
    expect(bodies.map(({ id, ring }) => [id, ring])).toEqual([
      ['s1', 0], ['s2', 1], ['s3', 2],
    ]);
  });

  it('returns size=480 and cx=cy=240', () => {
    const { size, cx, cy } = computeOrbitLayout(subs);
    expect(size).toBe(480);
    expect(cx).toBe(240);
    expect(cy).toBe(240);
  });

  it('handles empty subscription list', () => {
    const { bodies } = computeOrbitLayout([]);
    expect(bodies).toHaveLength(0);
  });
});
