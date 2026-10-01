import type { OrbitSubscription, BodyLayout, OrbitLayoutResult } from './types';

const SIZE = 320;
const CENTRE = SIZE / 2;

/** Ring radii in logical pixels (proportional to the 480px SVG version). */
const RING_RADII = [48, 104, 160, 216] as const;

const MIN_R = 8;
const MAX_R = 22;

function clamp(v: number, lo: number, hi: number) {
  return Math.min(Math.max(v, lo), hi);
}

export function radiusFromCost(costMinor: number, allCosts: readonly number[]): number {
  const max = Math.max(...allCosts, 1);
  const norm = Math.sqrt(costMinor / max);
  return clamp(MIN_R + norm * (MAX_R - MIN_R), MIN_R, MAX_R);
}

export function ringIndex(sub: OrbitSubscription, memberOrder: readonly string[]): number {
  if (sub.ownerType === 'ME') return 0;
  if (sub.ownerType === 'HOUSEHOLD') return 1;
  const idx = sub.memberId ? memberOrder.indexOf(sub.memberId) : -1;
  return 2 + Math.max(0, idx);
}

export function anglesForCadence(count: number, cadence: 'MONTHLY' | 'ANNUAL'): number[] {
  if (count === 0) return [];
  const start = cadence === 'MONTHLY' ? 0 : Math.PI;
  const span = Math.PI;
  const step = count === 1 ? 0 : span / (count - 1);
  return Array.from({ length: count }, (_, i) =>
    start + i * step + (count === 1 ? span / 2 : 0),
  );
}

export function toOffset(ring: number, angle: number): { dx: number; dy: number } {
  const r = RING_RADII[Math.min(ring, RING_RADII.length - 1)] ?? RING_RADII[RING_RADII.length - 1];
  return {
    dx: r * Math.sin(angle),
    dy: -r * Math.cos(angle),
  };
}

function memberOrder(subs: readonly OrbitSubscription[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const s of subs) {
    if (s.ownerType === 'MEMBER' && s.memberId && !seen.has(s.memberId)) {
      seen.add(s.memberId);
      order.push(s.memberId);
    }
  }
  return order;
}

export function computeOrbitLayout(subs: readonly OrbitSubscription[]): OrbitLayoutResult {
  const allCosts = subs.map((s) => s.monthlyCostMinor);
  const order = memberOrder(subs);

  type GroupKey = string;
  const groups = new Map<GroupKey, OrbitSubscription[]>();
  for (const sub of subs) {
    const ring = ringIndex(sub, order);
    const key: GroupKey = `${ring}:${sub.billingCadence}`;
    const group = groups.get(key) ?? [];
    group.push(sub);
    groups.set(key, group);
  }

  const bodies: BodyLayout[] = [];
  for (const [key, group] of groups) {
    const [ringStr, cadence] = key.split(':') as [string, 'MONTHLY' | 'ANNUAL'];
    const ring = parseInt(ringStr, 10);
    const angles = anglesForCadence(group.length, cadence);
    group.forEach((sub, i) => {
      const angle = angles[i] ?? 0;
      const { dx, dy } = toOffset(ring, angle);
      bodies.push({
        id: sub.id,
        dx,
        dy,
        r: radiusFromCost(sub.monthlyCostMinor, allCosts),
        ring,
        angle,
        subscription: sub,
      });
    });
  }

  return { bodies, size: SIZE, centre: CENTRE };
}
