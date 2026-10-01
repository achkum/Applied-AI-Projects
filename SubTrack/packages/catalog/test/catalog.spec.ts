import { describe, it, expect, beforeAll } from 'vitest';
import { loadCatalog, clearCatalogCache, type CatalogData } from '../src/index.js';

let catalog: CatalogData;

beforeAll(() => {
  clearCatalogCache();
  catalog = loadCatalog();
});

// ─── counts ───────────────────────────────────────────────────────────────────

describe('catalog counts', () => {
  it('loads at least 60 merchants', () => {
    expect(catalog.merchants.length).toBeGreaterThanOrEqual(60);
  });

  it('loads at least 120 plans', () => {
    expect(catalog.plans.length).toBeGreaterThanOrEqual(120);
  });
});

// ─── merchant structural invariants ──────────────────────────────────────────

describe('merchant structural invariants', () => {
  it('all merchants have a non-empty key', () => {
    for (const m of catalog.merchants) {
      expect(m.key).toBeTruthy();
      expect(typeof m.key).toBe('string');
    }
  });

  it('all keys are unique', () => {
    const keys = catalog.merchants.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('all canonical_names are unique and non-empty', () => {
    const names = catalog.merchants.map((m) => m.canonicalName);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) {
      expect(n).toBeTruthy();
    }
  });

  it('all merchants have at least 2 aliases', () => {
    for (const m of catalog.merchants) {
      expect(m.aliases.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('all categories are non-empty uppercase strings', () => {
    for (const m of catalog.merchants) {
      expect(m.category).toBeTruthy();
      expect(m.category).toBe(m.category.toUpperCase());
    }
  });

  it('all categories are from the allowlist', () => {
    const ALLOWED = new Set([
      'VIDEO_STREAMING', 'MUSIC_AUDIO', 'AUDIOBOOKS_EBOOKS', 'NEWS_MAGAZINES',
      'GAMING', 'SOFTWARE_PRODUCTIVITY', 'CLOUD_STORAGE', 'AI_TOOLS',
      'MOBILE_PLAN', 'BROADBAND_TV', 'FITNESS_WELLNESS', 'FOOD_MEALKITS',
      'TRANSPORT_MOBILITY', 'HOME_SECURITY', 'EDUCATION_KIDS', 'PETS',
      'SHOPPING_MEMBERSHIPS', 'VPN_SECURITY', 'DONATIONS', 'DATING_SOCIAL',
      'APP_STORE_BILLING', 'OTHER_SUBSCRIPTION',
    ]);
    for (const m of catalog.merchants) {
      expect(ALLOWED.has(m.category), `Unknown category '${m.category}' for merchant '${m.key}'`).toBe(true);
    }
  });

  it('category_hue (when present) is in [0, 360]', () => {
    for (const m of catalog.merchants) {
      if (m.categoryHue !== undefined) {
        expect(m.categoryHue).toBeGreaterThanOrEqual(0);
        expect(m.categoryHue).toBeLessThanOrEqual(360);
      }
    }
  });
});

// ─── plan structural invariants ───────────────────────────────────────────────

describe('plan structural invariants', () => {
  it('all plans have a valid merchant_key', () => {
    const keys = new Set(catalog.merchants.map((m) => m.key));
    for (const p of catalog.plans) {
      expect(keys.has(p.merchantKey), `Unknown merchantKey '${p.merchantKey}'`).toBe(true);
    }
  });

  it('all plans have a non-empty name', () => {
    for (const p of catalog.plans) {
      expect(p.name).toBeTruthy();
    }
  });

  it('all plans have a valid period', () => {
    const VALID = new Set(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'IRREGULAR']);
    for (const p of catalog.plans) {
      expect(VALID.has(p.period), `Invalid period '${p.period}'`).toBe(true);
    }
  });

  it('all plans have a 3-letter currency code', () => {
    for (const p of catalog.plans) {
      expect(p.currency).toHaveLength(3);
    }
  });

  it('all plans with amountMinor set have positive integer values', () => {
    for (const p of catalog.plans) {
      if (p.amountMinor !== undefined) {
        expect(p.amountMinor).toBeGreaterThan(0);
        expect(Number.isInteger(p.amountMinor)).toBe(true);
      }
    }
  });

  it('all plans have a region (non-empty string)', () => {
    for (const p of catalog.plans) {
      expect(p.region).toBeTruthy();
    }
  });

  it('active is a boolean for all plans', () => {
    for (const p of catalog.plans) {
      expect(typeof p.active).toBe('boolean');
    }
  });
});

// ─── cross-reference coverage ─────────────────────────────────────────────────

describe('cross-reference coverage', () => {
  it('every merchant has at least one plan', () => {
    const merchantsWithPlans = new Set(catalog.plans.map((p) => p.merchantKey));
    for (const m of catalog.merchants) {
      expect(
        merchantsWithPlans.has(m.key),
        `Merchant '${m.key}' has no plans`,
      ).toBe(true);
    }
  });

  it('category distribution covers at least 8 distinct categories', () => {
    const categories = new Set(catalog.merchants.map((m) => m.category));
    expect(categories.size).toBeGreaterThanOrEqual(8);
  });

  it('VIDEO_STREAMING has at least 5 merchants', () => {
    const videoMerchants = catalog.merchants.filter((m) => m.category === 'VIDEO_STREAMING');
    expect(videoMerchants.length).toBeGreaterThanOrEqual(5);
  });

  it('most merchants have at least 2 plans', () => {
    const plansPerMerchant = new Map<string, number>();
    for (const p of catalog.plans) {
      plansPerMerchant.set(p.merchantKey, (plansPerMerchant.get(p.merchantKey) ?? 0) + 1);
    }
    const withMultiplePlans = [...plansPerMerchant.values()].filter((n) => n >= 2).length;
    const totalMerchants = catalog.merchants.length;
    expect(withMultiplePlans).toBeGreaterThanOrEqual(Math.floor(totalMerchants * 0.7));
  });

  it('Sweden-specific plans (region=SE) exist', () => {
    const sePlans = catalog.plans.filter((p) => p.region === 'SE');
    expect(sePlans.length).toBeGreaterThan(0);
  });
});

// ─── caching ──────────────────────────────────────────────────────────────────

describe('loadCatalog caching', () => {
  it('returns the same object on subsequent calls', () => {
    const a = loadCatalog();
    const b = loadCatalog();
    expect(a).toBe(b);
  });

  it('returns a fresh object after clearCatalogCache()', () => {
    const a = loadCatalog();
    clearCatalogCache();
    const b = loadCatalog();
    expect(a).not.toBe(b);
    expect(a.merchants.length).toBe(b.merchants.length);
  });
});
