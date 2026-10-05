import type { OrbitSubscription, BodyLayout, OrbitLayoutResult } from './types';

/** SVG canvas half-width; viewBox is `0 0 SIZE SIZE`. */
const SIZE = 720;
/** Original CSS viewBox scale used to preserve the existing pointer target size. */
export const HIT_TARGET_REFERENCE_SIZE = 480;
const CX = SIZE / 2;
const CY = SIZE / 2;

/** Orbital ring radii (centre-to-centre of ring path). */
const RING_RADII = [72, 152, 232, 312] as const;

/** Body radius range in SVG units. */
const MIN_BODY_R = 10;
const MAX_BODY_R = 28;

/** Clamp a value between lo and hi. */
function clamp(v: number, lo: number, hi: number) {
  return Math.min(Math.max(v, lo), hi);
}

/**
 * Map monthlyCostMinor to a circle radius.
 * Derived from square-root scaling so area ∝ cost (perceptually fairer).
 */
export function radiusFromCost(
  costMinor: number,
  allCosts: readonly number[],
): number {
  const max = Math.max(...allCosts, 1);
  const normalised = Math.sqrt(costMinor / max);
  return clamp(MIN_BODY_R + normalised * (MAX_BODY_R - MIN_BODY_R), MIN_BODY_R, MAX_BODY_R);
}

/**
 * Assign a ring index to a subscription.
 *   Ring 0 — ME subscriptions (innermost)
 *   Ring 1 — HOUSEHOLD subscriptions
 *   Ring 2+ — MEMBER subscriptions; one extra ring per unique member (stable sort order)
 */
export function ringIndex(
  sub: OrbitSubscription,
  memberOrder: readonly string[],
): number {
  if (sub.ownerType === 'ME') return 0;
  if (sub.ownerType === 'HOUSEHOLD') return 1;
  const idx = sub.memberId ? memberOrder.indexOf(sub.memberId) : -1;
  return 2 + Math.max(0, idx);
}

/**
 * ANNUAL subscriptions are placed in the "outer half" of their ring arc (π..2π),
 * MONTHLY in the inner half (0..π). Within each half, bodies are spread evenly.
 */
export function anglesForCadence(
  count: number,
  cadence: 'MONTHLY' | 'ANNUAL',
): number[] {
  if (count === 0) return [];
  const start = cadence === 'MONTHLY' ? 0 : Math.PI;
  const span = Math.PI;
  const step = count === 1 ? 0 : span / (count - 1);
  return Array.from({ length: count }, (_, i) =>
    start + i * step + (count === 1 ? span / 2 : 0),
  );
}

/** Build SVG x,y from polar (ring + angle) relative to the canvas centre. */
export function toCartesian(ring: number, angle: number): { x: number; y: number } {
  const r = RING_RADII[Math.min(ring, RING_RADII.length - 1)] ?? 312;
  return {
    x: CX + r * Math.sin(angle),
    y: CY - r * Math.cos(angle),
  };
}

/** Derive the stable member ordering from the subscription list. */
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

/** Main layout function: takes subscriptions, returns placed bodies. */
export function computeOrbitLayout(
  subs: readonly OrbitSubscription[],
): OrbitLayoutResult {
  const allCosts = subs.map((s) => s.monthlyCostMinor);
  const order = memberOrder(subs);

  // Group by (ring, cadence) for angle assignment
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
      const { x, y } = toCartesian(ring, angle);
      bodies.push({
        id: sub.id,
        cx: x,
        cy: y,
        r: radiusFromCost(sub.monthlyCostMinor, allCosts),
        ring,
        angle,
        subscription: sub,
      });
    });
  }

  return { bodies, size: SIZE, cx: CX, cy: CY };
}
