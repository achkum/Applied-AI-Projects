import { describe, it, expect } from 'vitest';
import {
  ALL_PERSONAS,
  PERSONA_SOLBERG,
  PERSONA_LINDQVIST,
  PERSONA_AHMADI,
  PERSONA_ERIKSSON,
  PERSONA_OKONKWO,
  type PersonaHousehold,
} from '../src/index.js';

// ─── structural invariants ────────────────────────────────────────────────────

describe('ALL_PERSONAS', () => {
  it('contains exactly 5 households', () => {
    expect(ALL_PERSONAS).toHaveLength(5);
  });

  it('all household ids are unique', () => {
    const ids = ALL_PERSONAS.map((h) => h.id);
    expect(new Set(ids).size).toBe(5);
  });

  it('every household has at least one member', () => {
    for (const h of ALL_PERSONAS) {
      expect(h.members.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('every household has at least one subscription', () => {
    for (const h of ALL_PERSONAS) {
      expect(h.subscriptions.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('every subscription has at least 3 descriptor variants', () => {
    for (const h of ALL_PERSONAS) {
      for (const s of h.subscriptions) {
        expect(s.descriptorVariants.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('every subscription groundTruth.isRecurring is true', () => {
    for (const h of ALL_PERSONAS) {
      for (const s of h.subscriptions) {
        expect(s.groundTruth.isRecurring).toBe(true);
      }
    }
  });

  it('every subscription normalizedAmountMinor equals amountMinor', () => {
    for (const h of ALL_PERSONAS) {
      for (const s of h.subscriptions) {
        expect(s.groundTruth.normalizedAmountMinor).toBe(s.amountMinor);
      }
    }
  });

  it('MEMBER subscriptions have a memberId referencing a known member', () => {
    for (const h of ALL_PERSONAS) {
      const memberIds = new Set(h.members.map((m) => m.id));
      for (const s of h.subscriptions) {
        if (s.ownerType === 'MEMBER') {
          expect(s.memberId).toBeDefined();
          expect(memberIds.has(s.memberId!)).toBe(true);
        }
      }
    }
  });

  it('all currencies are SEK', () => {
    for (const h of ALL_PERSONAS) {
      for (const s of h.subscriptions) {
        expect(s.currency).toBe('SEK');
      }
    }
  });

  it('all amountMinor values are positive integers', () => {
    for (const h of ALL_PERSONAS) {
      for (const s of h.subscriptions) {
        expect(s.amountMinor).toBeGreaterThan(0);
        expect(Number.isInteger(s.amountMinor)).toBe(true);
      }
    }
  });

  it('all billingCadence values are MONTHLY or ANNUAL', () => {
    const valid = new Set(['MONTHLY', 'ANNUAL']);
    for (const h of ALL_PERSONAS) {
      for (const s of h.subscriptions) {
        expect(valid.has(s.billingCadence)).toBe(true);
      }
    }
  });
});

// ─── coverage checks ──────────────────────────────────────────────────────────

describe('ownerType coverage', () => {
  function ownerTypes(h: PersonaHousehold): Set<string> {
    return new Set(h.subscriptions.map((s) => s.ownerType));
  }

  it('ahmadi uses HOUSEHOLD and MEMBER ownerTypes', () => {
    const types = ownerTypes(PERSONA_AHMADI);
    expect(types.has('HOUSEHOLD')).toBe(true);
    expect(types.has('MEMBER')).toBe(true);
  });

  it('lindqvist uses HOUSEHOLD ownerType', () => {
    expect(ownerTypes(PERSONA_LINDQVIST).has('HOUSEHOLD')).toBe(true);
  });

  it('solberg uses ME ownerType', () => {
    expect(ownerTypes(PERSONA_SOLBERG).has('ME')).toBe(true);
  });

  it('eriksson uses ME ownerType', () => {
    expect(ownerTypes(PERSONA_ERIKSSON).has('ME')).toBe(true);
  });
});

// ─── per-household specifics ──────────────────────────────────────────────────

describe('PERSONA_SOLBERG', () => {
  it('has id "household-solberg"', () => {
    expect(PERSONA_SOLBERG.id).toBe('household-solberg');
  });

  it('has 4 subscriptions', () => {
    expect(PERSONA_SOLBERG.subscriptions).toHaveLength(4);
  });

  it('has 1 annual subscription (LinkedIn Premium)', () => {
    const annual = PERSONA_SOLBERG.subscriptions.filter((s) => s.billingCadence === 'ANNUAL');
    expect(annual).toHaveLength(1);
    expect(annual[0]?.merchantId).toBe('linkedin-premium');
  });
});

describe('PERSONA_LINDQVIST', () => {
  it('has id "household-lindqvist"', () => {
    expect(PERSONA_LINDQVIST.id).toBe('household-lindqvist');
  });

  it('has 2 members', () => {
    expect(PERSONA_LINDQVIST.members).toHaveLength(2);
  });

  it('has 6 subscriptions', () => {
    expect(PERSONA_LINDQVIST.subscriptions).toHaveLength(6);
  });
});

describe('PERSONA_AHMADI', () => {
  it('has id "household-ahmadi"', () => {
    expect(PERSONA_AHMADI.id).toBe('household-ahmadi');
  });

  it('has 8 subscriptions', () => {
    expect(PERSONA_AHMADI.subscriptions).toHaveLength(8);
  });

  it('has MEMBER subscriptions for karim and sara', () => {
    const memberSubs = PERSONA_AHMADI.subscriptions.filter((s) => s.ownerType === 'MEMBER');
    const memberIds = new Set(memberSubs.map((s) => s.memberId));
    expect(memberIds.has('karim')).toBe(true);
    expect(memberIds.has('sara')).toBe(true);
  });
});

describe('PERSONA_ERIKSSON', () => {
  it('has id "household-eriksson"', () => {
    expect(PERSONA_ERIKSSON.id).toBe('household-eriksson');
  });

  it('has 3 subscriptions', () => {
    expect(PERSONA_ERIKSSON.subscriptions).toHaveLength(3);
  });

  it('total monthly spend ≤ 35 000 öre (student budget)', () => {
    const monthlyTotal = PERSONA_ERIKSSON.subscriptions
      .filter((s) => s.billingCadence === 'MONTHLY')
      .reduce((sum, s) => sum + s.amountMinor, 0);
    expect(monthlyTotal).toBeLessThanOrEqual(35_000);
  });
});

describe('PERSONA_OKONKWO', () => {
  it('has id "household-okonkwo"', () => {
    expect(PERSONA_OKONKWO.id).toBe('household-okonkwo');
  });

  it('has 5 subscriptions', () => {
    expect(PERSONA_OKONKWO.subscriptions).toHaveLength(5);
  });

  it('all subscriptions are software-productivity or cloud-infrastructure', () => {
    const professionalCategories = new Set(['software-productivity', 'cloud-infrastructure']);
    for (const s of PERSONA_OKONKWO.subscriptions) {
      expect(professionalCategories.has(s.category)).toBe(true);
    }
  });
});

// ─── snapshot tests (lock fixture stability) ─────────────────────────────────

describe('persona snapshots', () => {
  it('PERSONA_SOLBERG matches snapshot', () => {
    expect(PERSONA_SOLBERG).toMatchSnapshot();
  });

  it('PERSONA_LINDQVIST matches snapshot', () => {
    expect(PERSONA_LINDQVIST).toMatchSnapshot();
  });

  it('PERSONA_AHMADI matches snapshot', () => {
    expect(PERSONA_AHMADI).toMatchSnapshot();
  });

  it('PERSONA_ERIKSSON matches snapshot', () => {
    expect(PERSONA_ERIKSSON).toMatchSnapshot();
  });

  it('PERSONA_OKONKWO matches snapshot', () => {
    expect(PERSONA_OKONKWO).toMatchSnapshot();
  });
});
