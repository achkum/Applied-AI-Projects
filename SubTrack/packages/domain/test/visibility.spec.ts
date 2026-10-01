/**
 * Tests for the subscription visibility policy (ST-048).
 *
 * AC1: owner / explicit-share / household-open-book rules
 * AC2: banking data is always denied to non-owners
 * AC3: RLS parity — TypeScript policy must agree with SQL-equivalent logic
 */
import { describe, it, expect } from 'vitest';
import {
  canViewSubscription,
  canViewBankingData,
  canReadAuditLog,
  type HouseholdMembership,
  type SubscriptionShare,
  type OpenBookConsent,
  type SubscriptionVisibilityContext,
} from '../policy/index.js';

// ── helpers ──────────────────────────────────────────────────────────────────

const ALICE = 'identity-alice';
const BOB = 'identity-bob';
const CAROL = 'identity-carol';
const HH1 = 'household-1';
const HH2 = 'household-2';

function membership(
  identityId: string,
  householdId: string,
  role: 'ADMIN' | 'MEMBER' = 'MEMBER',
  leftAt: Date | null = null,
): HouseholdMembership {
  return { identityId, householdId, role, leftAt };
}

function share(
  ownerId: string,
  recipientId: string,
  revokedAt: Date | null = null,
): SubscriptionShare {
  return { ownerId, recipientId, revokedAt };
}

function consent(
  identityId: string,
  householdId: string,
  openBook: boolean,
): OpenBookConsent {
  return { identityId, householdId, openBook };
}

function ctx(
  ownerId: string,
  alwaysPrivate: boolean,
  {
    shares = [],
    ownerMemberships = [],
    viewerMemberships = [],
    ownerConsents = [],
  }: Partial<Omit<SubscriptionVisibilityContext, 'ownerId' | 'alwaysPrivate'>> = {},
): SubscriptionVisibilityContext {
  return { ownerId, alwaysPrivate, shares, ownerMemberships, viewerMemberships, ownerConsents };
}

// ── AC1: canViewSubscription ─────────────────────────────────────────────────

describe('canViewSubscription — owner rule', () => {
  it('owner can always see own subscription', () => {
    expect(canViewSubscription(ALICE, ctx(ALICE, false))).toBe(true);
  });

  it('owner can see own always-private subscription', () => {
    expect(canViewSubscription(ALICE, ctx(ALICE, true))).toBe(true);
  });
});

describe('canViewSubscription — explicit share rule', () => {
  it('active share grants access', () => {
    const c = ctx(ALICE, false, { shares: [share(ALICE, BOB)] });
    expect(canViewSubscription(BOB, c)).toBe(true);
  });

  it('revoked share denies access', () => {
    const c = ctx(ALICE, false, {
      shares: [share(ALICE, BOB, new Date('2025-01-01'))],
    });
    expect(canViewSubscription(BOB, c)).toBe(false);
  });

  it('share for a different recipient does not help the viewer', () => {
    const c = ctx(ALICE, false, { shares: [share(ALICE, CAROL)] });
    expect(canViewSubscription(BOB, c)).toBe(false);
  });

  it('share grants access even when always-private', () => {
    const c = ctx(ALICE, true, { shares: [share(ALICE, BOB)] });
    expect(canViewSubscription(BOB, c)).toBe(true);
  });
});

describe('canViewSubscription — household open-book rule', () => {
  it('GRANT: same household, open-book true, not always-private', () => {
    const c = ctx(ALICE, false, {
      ownerMemberships: [membership(ALICE, HH1)],
      viewerMemberships: [membership(BOB, HH1)],
      ownerConsents: [consent(ALICE, HH1, true)],
    });
    expect(canViewSubscription(BOB, c)).toBe(true);
  });

  it('DENY: same household, open-book FALSE', () => {
    const c = ctx(ALICE, false, {
      ownerMemberships: [membership(ALICE, HH1)],
      viewerMemberships: [membership(BOB, HH1)],
      ownerConsents: [consent(ALICE, HH1, false)],
    });
    expect(canViewSubscription(BOB, c)).toBe(false);
  });

  it('DENY: same household, open-book true, but always-private', () => {
    const c = ctx(ALICE, true, {
      ownerMemberships: [membership(ALICE, HH1)],
      viewerMemberships: [membership(BOB, HH1)],
      ownerConsents: [consent(ALICE, HH1, true)],
    });
    expect(canViewSubscription(BOB, c)).toBe(false);
  });

  it('DENY: different households', () => {
    const c = ctx(ALICE, false, {
      ownerMemberships: [membership(ALICE, HH1)],
      viewerMemberships: [membership(BOB, HH2)],
      ownerConsents: [consent(ALICE, HH1, true)],
    });
    expect(canViewSubscription(BOB, c)).toBe(false);
  });

  it('DENY: open-book consent missing for the shared household', () => {
    const c = ctx(ALICE, false, {
      ownerMemberships: [membership(ALICE, HH1)],
      viewerMemberships: [membership(BOB, HH1)],
      ownerConsents: [consent(ALICE, HH2, true)], // consent is for HH2, not HH1
    });
    expect(canViewSubscription(BOB, c)).toBe(false);
  });

  it('DENY: owner has left the household', () => {
    const c = ctx(ALICE, false, {
      ownerMemberships: [membership(ALICE, HH1, 'MEMBER', new Date('2025-01-01'))],
      viewerMemberships: [membership(BOB, HH1)],
      ownerConsents: [consent(ALICE, HH1, true)],
    });
    expect(canViewSubscription(BOB, c)).toBe(false);
  });

  it('DENY: viewer has left the household', () => {
    const c = ctx(ALICE, false, {
      ownerMemberships: [membership(ALICE, HH1)],
      viewerMemberships: [membership(BOB, HH1, 'MEMBER', new Date('2025-01-01'))],
      ownerConsents: [consent(ALICE, HH1, true)],
    });
    expect(canViewSubscription(BOB, c)).toBe(false);
  });

  it('GRANT: viewer in multiple households — correct one matches', () => {
    const c = ctx(ALICE, false, {
      ownerMemberships: [membership(ALICE, HH1)],
      viewerMemberships: [membership(BOB, HH1), membership(BOB, HH2)],
      ownerConsents: [consent(ALICE, HH1, true)],
    });
    expect(canViewSubscription(BOB, c)).toBe(true);
  });

  it('third party in no shared household is denied', () => {
    const c = ctx(ALICE, false, {
      ownerMemberships: [membership(ALICE, HH1)],
      viewerMemberships: [],
      ownerConsents: [consent(ALICE, HH1, true)],
    });
    expect(canViewSubscription(CAROL, c)).toBe(false);
  });
});

// ── AC2: canViewBankingData ───────────────────────────────────────────────────

describe('canViewBankingData', () => {
  it('owner can view their own banking data', () => {
    expect(canViewBankingData(ALICE, ALICE)).toBe(true);
  });

  it('household member is DENIED banking data regardless of open-book', () => {
    expect(canViewBankingData(BOB, ALICE)).toBe(false);
  });

  it('complete stranger is denied', () => {
    expect(canViewBankingData(CAROL, ALICE)).toBe(false);
  });
});

// ── canReadAuditLog ───────────────────────────────────────────────────────────

describe('canReadAuditLog', () => {
  it('ADMIN in the household can read audit log', () => {
    expect(
      canReadAuditLog(ALICE, HH1, [membership(ALICE, HH1, 'ADMIN')]),
    ).toBe(true);
  });

  it('MEMBER (non-admin) is denied audit log', () => {
    expect(
      canReadAuditLog(BOB, HH1, [membership(BOB, HH1, 'MEMBER')]),
    ).toBe(false);
  });

  it('admin of a DIFFERENT household is denied', () => {
    expect(
      canReadAuditLog(ALICE, HH1, [membership(ALICE, HH2, 'ADMIN')]),
    ).toBe(false);
  });

  it('admin who has left the household is denied', () => {
    expect(
      canReadAuditLog(ALICE, HH1, [
        membership(ALICE, HH1, 'ADMIN', new Date('2025-01-01')),
      ]),
    ).toBe(false);
  });
});

// ── AC3: RLS parity ──────────────────────────────────────────────────────────
//
// The SQL RLS SELECT policy for the subscription table (when implemented) is:
//
//   USING (
//     -- owner
//     owner_id = current_setting('app.current_user_id')::uuid
//     -- explicit share
//     OR id IN (
//       SELECT subscription_id FROM subscription_share
//       WHERE recipient_id = current_setting('app.current_user_id')::uuid
//         AND revoked_at IS NULL
//     )
//     -- household open-book
//     OR (
//       always_private = false
//       AND owner_id IN (
//         SELECT om.identity_id FROM household_member om
//         INNER JOIN household_member vm
//           ON om.household_id = vm.household_id
//         INNER JOIN consent c
//           ON c.identity_id = om.identity_id
//          AND c.scope_id = om.household_id
//          AND c.open_book = true
//         WHERE vm.identity_id = current_setting('app.current_user_id')::uuid
//           AND om.left_at IS NULL AND vm.left_at IS NULL
//       )
//     )
//   )
//
// The function below mirrors that SQL logic as TypeScript, allowing parity
// verification against the policy implementation.

function sqlEquivalentCanView(
  viewerId: string,
  c: SubscriptionVisibilityContext,
): boolean {
  if (c.ownerId === viewerId) return true;

  const activeRevs = c.shares.filter((s) => s.revokedAt === null);
  if (activeRevs.some((s) => s.recipientId === viewerId && s.ownerId === c.ownerId))
    return true;

  if (c.alwaysPrivate) return false;

  const activeOwnerHouseholds = new Set(
    c.ownerMemberships
      .filter((m) => m.leftAt === null && m.identityId === c.ownerId)
      .map((m) => m.householdId),
  );
  const activeViewerHouseholds = new Set(
    c.viewerMemberships
      .filter((m) => m.leftAt === null && m.identityId === viewerId)
      .map((m) => m.householdId),
  );

  for (const hh of activeOwnerHouseholds) {
    if (!activeViewerHouseholds.has(hh)) continue;
    const con = c.ownerConsents.find(
      (x) => x.identityId === c.ownerId && x.householdId === hh,
    );
    if (con?.openBook === true) return true;
  }

  return false;
}

describe('AC3: RLS parity — canViewSubscription matches SQL-equivalent for all test cases', () => {
  const CASES: Array<{ label: string; viewerId: string; c: SubscriptionVisibilityContext }> = [
    {
      label: 'owner view own',
      viewerId: ALICE,
      c: ctx(ALICE, false),
    },
    {
      label: 'stranger denied',
      viewerId: BOB,
      c: ctx(ALICE, false),
    },
    {
      label: 'active share',
      viewerId: BOB,
      c: ctx(ALICE, false, { shares: [share(ALICE, BOB)] }),
    },
    {
      label: 'revoked share',
      viewerId: BOB,
      c: ctx(ALICE, false, { shares: [share(ALICE, BOB, new Date())] }),
    },
    {
      label: 'household open-book grant',
      viewerId: BOB,
      c: ctx(ALICE, false, {
        ownerMemberships: [membership(ALICE, HH1)],
        viewerMemberships: [membership(BOB, HH1)],
        ownerConsents: [consent(ALICE, HH1, true)],
      }),
    },
    {
      label: 'household open-book=false deny',
      viewerId: BOB,
      c: ctx(ALICE, false, {
        ownerMemberships: [membership(ALICE, HH1)],
        viewerMemberships: [membership(BOB, HH1)],
        ownerConsents: [consent(ALICE, HH1, false)],
      }),
    },
    {
      label: 'always-private deny despite open-book',
      viewerId: BOB,
      c: ctx(ALICE, true, {
        ownerMemberships: [membership(ALICE, HH1)],
        viewerMemberships: [membership(BOB, HH1)],
        ownerConsents: [consent(ALICE, HH1, true)],
      }),
    },
    {
      label: 'owner left household',
      viewerId: BOB,
      c: ctx(ALICE, false, {
        ownerMemberships: [membership(ALICE, HH1, 'MEMBER', new Date())],
        viewerMemberships: [membership(BOB, HH1)],
        ownerConsents: [consent(ALICE, HH1, true)],
      }),
    },
    {
      label: 'viewer left household',
      viewerId: BOB,
      c: ctx(ALICE, false, {
        ownerMemberships: [membership(ALICE, HH1)],
        viewerMemberships: [membership(BOB, HH1, 'MEMBER', new Date())],
        ownerConsents: [consent(ALICE, HH1, true)],
      }),
    },
    {
      label: 'different households',
      viewerId: BOB,
      c: ctx(ALICE, false, {
        ownerMemberships: [membership(ALICE, HH1)],
        viewerMemberships: [membership(BOB, HH2)],
        ownerConsents: [consent(ALICE, HH1, true)],
      }),
    },
    {
      label: 'always-private but share active',
      viewerId: BOB,
      c: ctx(ALICE, true, { shares: [share(ALICE, BOB)] }),
    },
  ];

  for (const { label, viewerId, c } of CASES) {
    it(`parity: ${label}`, () => {
      const tsResult = canViewSubscription(viewerId, c);
      const sqlResult = sqlEquivalentCanView(viewerId, c);
      expect(tsResult).toBe(sqlResult);
    });
  }
});
