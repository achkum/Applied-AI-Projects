import { radiusFromCost, ringIndex, anglesForCadence, toOffset, computeOrbitLayout } from '../orbitMath';
import type { OrbitSubscription } from '../types';

describe('radiusFromCost', () => {
  it('returns MIN_R for zero cost', () => {
    expect(radiusFromCost(0, [0, 10000])).toBe(8);
  });

  it('returns MAX_R for the highest cost', () => {
    expect(radiusFromCost(10000, [10000])).toBe(22);
  });

  it('scales midpoint to roughly mid-range', () => {
    const r = radiusFromCost(2500, [0, 10000]); // sqrt(0.25)=0.5 → 8+0.5*14=15
    expect(r).toBeCloseTo(15, 0);
  });
});

describe('ringIndex', () => {
  const sub = (ownerType: OrbitSubscription['ownerType'], memberId?: string): OrbitSubscription =>
    ({ ownerType, memberId } as OrbitSubscription);

  it('assigns ring 0 to ME', () => {
    expect(ringIndex(sub('ME'), [])).toBe(0);
  });

  it('assigns ring 1 to HOUSEHOLD', () => {
    expect(ringIndex(sub('HOUSEHOLD'), [])).toBe(1);
  });

  it('assigns ring 2 to first member, ring 3 to second', () => {
    const order = ['alice', 'bob'];
    expect(ringIndex(sub('MEMBER', 'alice'), order)).toBe(2);
    expect(ringIndex(sub('MEMBER', 'bob'), order)).toBe(3);
  });
});

describe('anglesForCadence', () => {
  it('returns empty for count=0', () => {
    expect(anglesForCadence(0, 'MONTHLY')).toEqual([]);
  });

  it('centres single MONTHLY at π/2', () => {
    const a = anglesForCadence(1, 'MONTHLY')[0];
    if (a === undefined) throw new Error('Expected one MONTHLY angle');
    expect(a).toBeCloseTo(Math.PI / 2, 5);
  });

  it('centres single ANNUAL at 3π/2', () => {
    const a = anglesForCadence(1, 'ANNUAL')[0];
    if (a === undefined) throw new Error('Expected one ANNUAL angle');
    expect(a).toBeCloseTo((3 * Math.PI) / 2, 5);
  });
});

describe('toOffset', () => {
  it('ring 0 angle 0 → directly above (dy negative, dx ≈ 0)', () => {
    const { dx, dy } = toOffset(0, 0);
    expect(dx).toBeCloseTo(0, 1);
    expect(dy).toBeCloseTo(-48, 1); // -RING_RADII[0]
  });

  it('ring 0 angle π/2 → to the right (dx positive, dy ≈ 0)', () => {
    const { dx, dy } = toOffset(0, Math.PI / 2);
    expect(dx).toBeCloseTo(48, 1);
    expect(dy).toBeCloseTo(0, 1);
  });
});

describe('computeOrbitLayout', () => {
  const subs: OrbitSubscription[] = [
    { id: 's1', name: 'Netflix', category: 'streaming', ownerType: 'ME',        monthlyCostMinor: 10000, billingCadence: 'MONTHLY' },
    { id: 's2', name: 'iCloud',  category: 'cloud',     ownerType: 'HOUSEHOLD', monthlyCostMinor:  5000, billingCadence: 'MONTHLY' },
    { id: 's3', name: 'Peloton', category: 'fitness',   ownerType: 'MEMBER', memberId: 'alice', monthlyCostMinor: 8000, billingCadence: 'ANNUAL' },
  ];

  it('returns a body per subscription', () => {
    expect(computeOrbitLayout(subs).bodies).toHaveLength(3);
  });

  it('assigns correct rings', () => {
    const { bodies } = computeOrbitLayout(subs);
    const byId = Object.fromEntries(bodies.map((b) => [b.id, b]));
    const me = byId['s1'];
    const household = byId['s2'];
    const member = byId['s3'];
    if (!me || !household || !member) {
      throw new Error('Expected a layout body for every subscription');
    }
    expect(me.ring).toBe(0);
    expect(household.ring).toBe(1);
    expect(member.ring).toBe(2);
  });

  it('returns size=320, centre=160', () => {
    const { size, centre } = computeOrbitLayout(subs);
    expect(size).toBe(320);
    expect(centre).toBe(160);
  });

  it('handles empty list', () => {
    expect(computeOrbitLayout([]).bodies).toHaveLength(0);
  });
});
