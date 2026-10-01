/**
 * AC3: RLS parity tests.
 *
 * The subscription table carries this RLS USING clause (from migration 0002):
 *
 *   USING (
 *     -- Rule 1: owner
 *     identity_id = current_setting('app.current_user_id')::uuid
 *
 *     -- Rule 2: active explicit share in a household the requester belongs to
 *     OR EXISTS (
 *       SELECT 1 FROM subscription_share ss
 *       JOIN household_member hm_v
 *         ON hm_v.household_id = ss.household_id
 *        AND hm_v.identity_id  = current_setting('app.current_user_id')::uuid
 *        AND hm_v.left_at IS NULL
 *       WHERE ss.subscription_id = subscription.id
 *         AND ss.revoked_at IS NULL
 *     )
 *
 *     -- Rule 3: owner open_book + requester in same household + not always_private
 *     OR (
 *       NOT always_private
 *       AND EXISTS (
 *         SELECT 1 FROM household_member hm_o
 *         JOIN consent c
 *           ON c.identity_id = hm_o.identity_id
 *          AND c.scope_id    = hm_o.household_id
 *          AND c.scope_type  = 'HOUSEHOLD'
 *          AND c.open_book   = true
 *         JOIN household_member hm_v
 *           ON hm_v.household_id = hm_o.household_id
 *          AND hm_v.identity_id  = current_setting('app.current_user_id')::uuid
 *          AND hm_v.left_at IS NULL
 *         WHERE hm_o.identity_id = subscription.identity_id
 *           AND hm_o.left_at IS NULL
 *       )
 *     )
 *   )
 *
 * HouseholdMembership.openBook encodes the JOIN to consent(open_book=true) —
 * the API service resolves it before calling the policy.
 *
 * This test verifies that the TypeScript evaluateSubscriptionVisibility is
 * structurally equivalent to the SQL USING clause by:
 *   1. Implementing a reference function that mirrors the SQL step-by-step.
 *   2. Running both against 500 deterministically generated cases.
 *   3. Asserting zero mismatches.
 */

import { describe, expect, it } from 'vitest';
import { evaluateSubscriptionVisibility } from '../subscription-visibility.js';
import type { SubscriptionVisibilityContext, VisibilityDecision } from '../types.js';

/**
 * SQL-equivalent reference implementation.
 * Each comment block maps to the corresponding SQL clause above.
 */
function sqlEquivalentDecision(
  requesterId: string,
  ctx: SubscriptionVisibilityContext,
): VisibilityDecision {
  // identity_id = current_setting('app.current_user_id')::uuid
  if (ctx.ownerId === requesterId) return 'GRANTED';

  // hm_v rows for the requester (left_at IS NULL already filtered in activeMemberships)
  const requesterHouseholds = new Set(
    ctx.activeMemberships
      .filter(m => m.identityId === requesterId)
      .map(m => m.householdId),
  );

  // EXISTS (subscription_share ss JOIN household_member hm_v ...)
  for (const ss of ctx.activeShares) {
    // ss.subscription_id = subscription.id AND ss.revoked_at IS NULL
    if (ss.subscriptionId !== ctx.subscriptionId) continue;
    // hm_v.household_id = ss.household_id AND hm_v.identity_id = current_user
    if (requesterHouseholds.has(ss.householdId)) return 'GRANTED';
  }

  // NOT always_private AND EXISTS (hm_o JOIN consent c JOIN hm_v ...)
  if (!ctx.alwaysPrivate) {
    for (const hm_o of ctx.activeMemberships) {
      // hm_o.identity_id = subscription.identity_id AND hm_o.left_at IS NULL
      if (hm_o.identityId !== ctx.ownerId) continue;
      // JOIN consent c ... AND c.open_book = true  (encoded as hm_o.openBook)
      if (!hm_o.openBook) continue;
      // JOIN household_member hm_v ON hm_v.household_id = hm_o.household_id AND hm_v.identity_id = current_user
      if (requesterHouseholds.has(hm_o.householdId)) return 'GRANTED';
    }
  }

  return 'DENIED';
}

// Deterministic xorshift32 PRNG.
function seededRand(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0x100000000;
  };
}

function generateTestCase(
  rand: () => number,
  idx: number,
): { requesterId: string; ctx: SubscriptionVisibilityContext } {
  const ownerId = `u${idx % 4}`;
  const requesterId = `u${(idx + 1) % 5}`;
  const subId = `s${idx}`;

  const hhCount = Math.floor(rand() * 3);
  const households = Array.from({ length: hhCount }, (_, i) => `h${idx}-${i}`);

  const activeMemberships = [];
  for (const hh of households) {
    if (rand() > 0.4) {
      activeMemberships.push({ identityId: ownerId, householdId: hh, openBook: rand() > 0.5 });
    }
    if (rand() > 0.4 && requesterId !== ownerId) {
      activeMemberships.push({ identityId: requesterId, householdId: hh, openBook: rand() > 0.5 });
    }
  }

  const activeShares = [];
  if (households.length > 0 && rand() > 0.6) {
    const shareHh = households[Math.floor(rand() * households.length)]!;
    activeShares.push({ subscriptionId: subId, householdId: shareHh });
  }

  return {
    requesterId,
    ctx: {
      subscriptionId: subId,
      ownerId,
      alwaysPrivate: rand() > 0.7,
      activeShares,
      activeMemberships,
    },
  };
}

describe('RLS parity — evaluateSubscriptionVisibility matches SQL USING clause', () => {
  it('agrees with SQL reference on 500 generated cases', () => {
    const rand = seededRand(0xdeadbeef);
    const mismatches: number[] = [];

    for (let i = 0; i < 500; i++) {
      const { requesterId, ctx } = generateTestCase(rand, i);
      const ts = evaluateSubscriptionVisibility(requesterId, ctx);
      const sql = sqlEquivalentDecision(requesterId, ctx);
      if (ts !== sql) mismatches.push(i);
    }

    expect(mismatches).toEqual([]);
  });

  it('both always grant to the owner across 100 generated contexts', () => {
    const rand = seededRand(0xc0ffee);
    for (let i = 0; i < 100; i++) {
      const { ctx } = generateTestCase(rand, i);
      expect(evaluateSubscriptionVisibility(ctx.ownerId, ctx)).toBe('GRANTED');
      expect(sqlEquivalentDecision(ctx.ownerId, ctx)).toBe('GRANTED');
    }
  });

  it('both always deny a stranger with no memberships or shares across 100 contexts', () => {
    for (let i = 0; i < 100; i++) {
      const ctx: SubscriptionVisibilityContext = {
        subscriptionId: `s${i}`,
        ownerId: `owner-${i}`,
        alwaysPrivate: false,
        activeShares: [],
        activeMemberships: [],
      };
      expect(evaluateSubscriptionVisibility(`stranger-${i}`, ctx)).toBe('DENIED');
      expect(sqlEquivalentDecision(`stranger-${i}`, ctx)).toBe('DENIED');
    }
  });

  it('both deny when alwaysPrivate blocks Rule 3 but no share exists', () => {
    const rand = seededRand(0xbada55);
    let tested = 0;
    for (let i = 0; i < 200; i++) {
      const { requesterId, ctx: base } = generateTestCase(rand, i);
      if (requesterId === base.ownerId) continue;
      const ctx: SubscriptionVisibilityContext = { ...base, alwaysPrivate: true, activeShares: [] };
      // Only Rule 1 (owner) or Rule 2 (share) can grant; Rule 3 blocked and no shares
      const ts = evaluateSubscriptionVisibility(requesterId, ctx);
      const sql = sqlEquivalentDecision(requesterId, ctx);
      expect(ts).toBe(sql);
      tested++;
    }
    expect(tested).toBeGreaterThan(0);
  });
});
