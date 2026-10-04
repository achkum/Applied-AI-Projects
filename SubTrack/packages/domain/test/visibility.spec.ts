/**
 * Tests for the subscription visibility policy (ST-048).
 *
 * AC1: owner / household-scoped explicit-share / household-open-book rules
 * AC2: banking data is always denied to non-owners
 * AC3: RLS parity — TypeScript policy must agree with SQL-equivalent logic
 */
import { describe, it, expect } from 'vitest';
import {
  canViewSubscription,
  canViewBankingData,
  canReadAuditLog,
  type AuditLogMembership,
  type SubscriptionVisibilityContext,
} from '../policy/index.js';

const ALICE = 'identity-alice';
const BOB = 'identity-bob';
const CAROL = 'identity-carol';
const SUBSCRIPTION = 'subscription-1';
const HH1 = 'household-1';
const HH2 = 'household-2';

function ctx(
  ownerId: string,
  alwaysPrivate = false,
  overrides: Partial<SubscriptionVisibilityContext> = {},
): SubscriptionVisibilityContext {
  return {
    subscriptionId: SUBSCRIPTION,
    ownerId,
    alwaysPrivate,
    activeShares: [],
    activeMemberships: [],
    ...overrides,
  };
}

function membership(identityId: string, householdId: string, openBook = false) {
  return { identityId, householdId, openBook };
}

function auditMembership(
  identityId: string,
  householdId: string,
  role: AuditLogMembership['role'] = 'MEMBER',
  leftAt: Date | null = null,
): AuditLogMembership {
  return { identityId, householdId, role, leftAt };
}

describe('canViewSubscription — owner rule', () => {
  it('owner can always see own subscription', () => {
    expect(canViewSubscription(ALICE, ctx(ALICE))).toBe(true);
  });

  it('owner can see own always-private subscription', () => {
    expect(canViewSubscription(ALICE, ctx(ALICE, true))).toBe(true);
  });
});

describe('canViewSubscription — explicit household share rule', () => {
  it('active share grants access to an active member of the share household', () => {
    const context = ctx(ALICE, false, {
      activeShares: [{ subscriptionId: SUBSCRIPTION, householdId: HH1 }],
      activeMemberships: [membership(BOB, HH1)],
    });
    expect(canViewSubscription(BOB, context)).toBe(true);
  });

  it('revoked shares are absent from the active share context and deny access', () => {
    expect(canViewSubscription(BOB, ctx(ALICE))).toBe(false);
  });

  it('a share in a different household does not help the viewer', () => {
    const context = ctx(ALICE, false, {
      activeShares: [{ subscriptionId: SUBSCRIPTION, householdId: HH2 }],
      activeMemberships: [membership(BOB, HH1)],
    });
    expect(canViewSubscription(BOB, context)).toBe(false);
  });

  it('share grants access even when always-private', () => {
    const context = ctx(ALICE, true, {
      activeShares: [{ subscriptionId: SUBSCRIPTION, householdId: HH1 }],
      activeMemberships: [membership(BOB, HH1)],
    });
    expect(canViewSubscription(BOB, context)).toBe(true);
  });
});

describe('canViewSubscription — household open-book rule', () => {
  it('GRANT: same active household, owner open-book true, not always-private', () => {
    const context = ctx(ALICE, false, {
      activeMemberships: [membership(ALICE, HH1, true), membership(BOB, HH1)],
    });
    expect(canViewSubscription(BOB, context)).toBe(true);
  });

  it('DENY: same household, owner open-book false', () => {
    const context = ctx(ALICE, false, {
      activeMemberships: [membership(ALICE, HH1), membership(BOB, HH1)],
    });
    expect(canViewSubscription(BOB, context)).toBe(false);
  });

  it('DENY: open-book in another household does not grant access in the shared household', () => {
    const context = ctx(ALICE, false, {
      activeMemberships: [
        membership(ALICE, HH1),
        membership(ALICE, HH2, true),
        membership(BOB, HH1),
      ],
    });
    expect(canViewSubscription(BOB, context)).toBe(false);
  });

  it('DENY: same household, open-book true, but always-private', () => {
    const context = ctx(ALICE, true, {
      activeMemberships: [membership(ALICE, HH1, true), membership(BOB, HH1)],
    });
    expect(canViewSubscription(BOB, context)).toBe(false);
  });

  it('DENY: different households', () => {
    const context = ctx(ALICE, false, {
      activeMemberships: [membership(ALICE, HH1, true), membership(BOB, HH2)],
    });
    expect(canViewSubscription(BOB, context)).toBe(false);
  });

  it('DENY: owner has left the household', () => {
    // The canonical context contains active rows only, so a former member is omitted.
    const context = ctx(ALICE, false, { activeMemberships: [membership(BOB, HH1)] });
    expect(canViewSubscription(BOB, context)).toBe(false);
  });

  it('DENY: viewer has left the household', () => {
    // The canonical context contains active rows only, so a former member is omitted.
    const context = ctx(ALICE, false, { activeMemberships: [membership(ALICE, HH1, true)] });
    expect(canViewSubscription(BOB, context)).toBe(false);
  });

  it('GRANT: viewer in multiple households when one common household has owner open-book', () => {
    const context = ctx(ALICE, false, {
      activeMemberships: [
        membership(ALICE, 'owner-only', true),
        membership(ALICE, HH1, true),
        membership(BOB, HH1),
        membership(BOB, 'viewer-only'),
      ],
    });
    expect(canViewSubscription(BOB, context)).toBe(true);
  });

  it('third party in no shared household is denied', () => {
    const context = ctx(ALICE, false, {
      activeMemberships: [membership(ALICE, HH1, true)],
    });
    expect(canViewSubscription(CAROL, context)).toBe(false);
  });
});

describe('canViewBankingData', () => {
  it('owner can view their own banking data', () => {
    expect(canViewBankingData(ALICE, ALICE)).toBe(true);
  });

  it('household member is denied banking data regardless of open-book', () => {
    expect(canViewBankingData(BOB, ALICE)).toBe(false);
  });

  it('complete stranger is denied', () => {
    expect(canViewBankingData(CAROL, ALICE)).toBe(false);
  });
});

describe('canReadAuditLog', () => {
  it('active ADMIN in the household can read audit log', () => {
    expect(canReadAuditLog(ALICE, HH1, [auditMembership(ALICE, HH1, 'ADMIN')])).toBe(true);
  });

  it('MEMBER (non-admin) is denied audit log', () => {
    expect(canReadAuditLog(BOB, HH1, [auditMembership(BOB, HH1)])).toBe(false);
  });

  it('admin of a different household is denied', () => {
    expect(canReadAuditLog(ALICE, HH1, [auditMembership(ALICE, HH2, 'ADMIN')])).toBe(false);
  });

  it('admin who has left the household is denied', () => {
    expect(canReadAuditLog(ALICE, HH1, [
      auditMembership(ALICE, HH1, 'ADMIN', new Date('2025-01-01')),
    ])).toBe(false);
  });
});

/** SQL-equivalent reference matching the USING clause in migration 0002_subscription_visibility. */
function sqlEquivalentCanView(viewerId: string, context: SubscriptionVisibilityContext): boolean {
  if (context.ownerId === viewerId) return true;

  const viewerHouseholds = new Set(
    context.activeMemberships
      .filter(member => member.identityId === viewerId)
      .map(member => member.householdId),
  );

  if (context.activeShares.some(share =>
    share.subscriptionId === context.subscriptionId && viewerHouseholds.has(share.householdId))) {
    return true;
  }

  if (context.alwaysPrivate) return false;

  return context.activeMemberships.some(member =>
    member.identityId === context.ownerId
      && member.openBook
      && viewerHouseholds.has(member.householdId));
}

describe('AC3: RLS parity — canViewSubscription matches SQL-equivalent cases', () => {
  const cases: Array<{ label: string; viewerId: string; context: SubscriptionVisibilityContext }> = [
    { label: 'owner view own', viewerId: ALICE, context: ctx(ALICE) },
    { label: 'stranger denied', viewerId: BOB, context: ctx(ALICE) },
    {
      label: 'active share', viewerId: BOB,
      context: ctx(ALICE, false, {
        activeShares: [{ subscriptionId: SUBSCRIPTION, householdId: HH1 }],
        activeMemberships: [membership(BOB, HH1)],
      }),
    },
    {
      label: 'revoked share', viewerId: BOB,
      context: ctx(ALICE, false, { activeMemberships: [membership(BOB, HH1)] }),
    },
    {
      label: 'household open-book grant', viewerId: BOB,
      context: ctx(ALICE, false, {
        activeMemberships: [membership(ALICE, HH1, true), membership(BOB, HH1)],
      }),
    },
    {
      label: 'household open-book false deny', viewerId: BOB,
      context: ctx(ALICE, false, {
        activeMemberships: [membership(ALICE, HH1), membership(BOB, HH1)],
      }),
    },
    {
      label: 'always-private deny despite open-book', viewerId: BOB,
      context: ctx(ALICE, true, {
        activeMemberships: [membership(ALICE, HH1, true), membership(BOB, HH1)],
      }),
    },
    {
      label: 'owner left household', viewerId: BOB,
      context: ctx(ALICE, false, { activeMemberships: [membership(BOB, HH1)] }),
    },
    {
      label: 'viewer left household', viewerId: BOB,
      context: ctx(ALICE, false, { activeMemberships: [membership(ALICE, HH1, true)] }),
    },
    {
      label: 'different households', viewerId: BOB,
      context: ctx(ALICE, false, {
        activeMemberships: [membership(ALICE, HH1, true), membership(BOB, HH2)],
      }),
    },
    {
      label: 'always-private but active household share', viewerId: BOB,
      context: ctx(ALICE, true, {
        activeShares: [{ subscriptionId: SUBSCRIPTION, householdId: HH1 }],
        activeMemberships: [membership(BOB, HH1)],
      }),
    },
  ];

  for (const { label, viewerId, context } of cases) {
    it(`parity: ${label}`, () => {
      expect(canViewSubscription(viewerId, context)).toBe(sqlEquivalentCanView(viewerId, context));
    });
  }
});
