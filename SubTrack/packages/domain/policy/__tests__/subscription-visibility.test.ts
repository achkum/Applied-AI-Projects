import { describe, expect, it } from 'vitest';
import { isSharableCategory } from '../data-category.js';
import { evaluateSubscriptionVisibility } from '../subscription-visibility.js';
import type { SubscriptionVisibilityContext } from '../types.js';

const SUB_ID = 'sub-1';
const OWNER = 'user-owner';
const VIEWER = 'user-viewer';
const HH = 'household-1';

function makeCtx(overrides: Partial<SubscriptionVisibilityContext>): SubscriptionVisibilityContext {
  return {
    subscriptionId: SUB_ID,
    ownerId: OWNER,
    alwaysPrivate: false,
    activeShares: [],
    activeMemberships: [],
    ...overrides,
  };
}

describe('evaluateSubscriptionVisibility', () => {
  describe('Rule 1 — owner access', () => {
    it('grants to the owner', () => {
      expect(evaluateSubscriptionVisibility(OWNER, makeCtx({}))).toBe('GRANTED');
    });

    it('grants to the owner even when alwaysPrivate is true', () => {
      expect(evaluateSubscriptionVisibility(OWNER, makeCtx({ alwaysPrivate: true }))).toBe('GRANTED');
    });

    it('grants to the owner even with no shares or memberships', () => {
      expect(evaluateSubscriptionVisibility(OWNER, makeCtx({}))).toBe('GRANTED');
    });
  });

  describe('Rule 2 — explicit share', () => {
    it('grants when active share exists in a household the requester belongs to', () => {
      const ctx = makeCtx({
        activeShares: [{ subscriptionId: SUB_ID, householdId: HH }],
        activeMemberships: [{ identityId: VIEWER, householdId: HH, openBook: false }],
      });
      expect(evaluateSubscriptionVisibility(VIEWER, ctx)).toBe('GRANTED');
    });

    it('denies when share is in a different household from the requester', () => {
      const ctx = makeCtx({
        activeShares: [{ subscriptionId: SUB_ID, householdId: 'other-hh' }],
        activeMemberships: [{ identityId: VIEWER, householdId: HH, openBook: false }],
      });
      expect(evaluateSubscriptionVisibility(VIEWER, ctx)).toBe('DENIED');
    });

    it('denies when share exists but requester is in no household', () => {
      const ctx = makeCtx({
        activeShares: [{ subscriptionId: SUB_ID, householdId: HH }],
        activeMemberships: [],
      });
      expect(evaluateSubscriptionVisibility(VIEWER, ctx)).toBe('DENIED');
    });

    it('denies when share is for a different subscription id', () => {
      const ctx = makeCtx({
        activeShares: [{ subscriptionId: 'sub-other', householdId: HH }],
        activeMemberships: [{ identityId: VIEWER, householdId: HH, openBook: false }],
      });
      expect(evaluateSubscriptionVisibility(VIEWER, ctx)).toBe('DENIED');
    });

    it('grants via share regardless of alwaysPrivate', () => {
      // alwaysPrivate blocks Rule 3, but NOT Rule 2
      const ctx = makeCtx({
        alwaysPrivate: true,
        activeShares: [{ subscriptionId: SUB_ID, householdId: HH }],
        activeMemberships: [{ identityId: VIEWER, householdId: HH, openBook: false }],
      });
      expect(evaluateSubscriptionVisibility(VIEWER, ctx)).toBe('GRANTED');
    });
  });

  describe('Rule 3 — open-book household', () => {
    it('grants when owner has open_book in the same household and not alwaysPrivate', () => {
      const ctx = makeCtx({
        activeMemberships: [
          { identityId: OWNER, householdId: HH, openBook: true },
          { identityId: VIEWER, householdId: HH, openBook: false },
        ],
      });
      expect(evaluateSubscriptionVisibility(VIEWER, ctx)).toBe('GRANTED');
    });

    it('denies when owner has open_book but alwaysPrivate is true', () => {
      const ctx = makeCtx({
        alwaysPrivate: true,
        activeMemberships: [
          { identityId: OWNER, householdId: HH, openBook: true },
          { identityId: VIEWER, householdId: HH, openBook: false },
        ],
      });
      expect(evaluateSubscriptionVisibility(VIEWER, ctx)).toBe('DENIED');
    });

    it('denies when owner is in household but open_book is false', () => {
      const ctx = makeCtx({
        activeMemberships: [
          { identityId: OWNER, householdId: HH, openBook: false },
          { identityId: VIEWER, householdId: HH, openBook: false },
        ],
      });
      expect(evaluateSubscriptionVisibility(VIEWER, ctx)).toBe('DENIED');
    });

    it('denies when owner has open_book in a different household from the requester', () => {
      const ctx = makeCtx({
        activeMemberships: [
          { identityId: OWNER, householdId: 'owner-hh', openBook: true },
          { identityId: VIEWER, householdId: 'viewer-hh', openBook: false },
        ],
      });
      expect(evaluateSubscriptionVisibility(VIEWER, ctx)).toBe('DENIED');
    });

    it('grants when they share one household and owner has open_book, even if they are also in other households', () => {
      const ctx = makeCtx({
        activeMemberships: [
          { identityId: OWNER, householdId: 'only-owner-hh', openBook: true },
          { identityId: OWNER, householdId: HH, openBook: true },
          { identityId: VIEWER, householdId: HH, openBook: false },
          { identityId: VIEWER, householdId: 'only-viewer-hh', openBook: false },
        ],
      });
      expect(evaluateSubscriptionVisibility(VIEWER, ctx)).toBe('GRANTED');
    });
  });

  describe('stranger baseline', () => {
    it('denies with no shares and no memberships', () => {
      expect(evaluateSubscriptionVisibility(VIEWER, makeCtx({}))).toBe('DENIED');
    });

    it('denies when requester does not appear in any membership row', () => {
      const ctx = makeCtx({
        activeMemberships: [
          { identityId: OWNER, householdId: HH, openBook: true },
          { identityId: 'third-party', householdId: HH, openBook: false },
        ],
      });
      expect(evaluateSubscriptionVisibility(VIEWER, ctx)).toBe('DENIED');
    });
  });
});

describe('isSharableCategory — AC2', () => {
  it('returns false for TRANSACTION', () => {
    expect(isSharableCategory('TRANSACTION')).toBe(false);
  });

  it('returns false for BALANCE', () => {
    expect(isSharableCategory('BALANCE')).toBe(false);
  });

  it('returns false for ACCOUNT_NUMBER', () => {
    expect(isSharableCategory('ACCOUNT_NUMBER')).toBe(false);
  });

  it('returns false for NON_SUBSCRIPTION', () => {
    expect(isSharableCategory('NON_SUBSCRIPTION')).toBe(false);
  });

  it('returns true for SUBSCRIPTION', () => {
    expect(isSharableCategory('SUBSCRIPTION')).toBe(true);
  });
});
