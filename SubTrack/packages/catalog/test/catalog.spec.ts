import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { loadCatalog, clearCatalogCache, type CatalogData } from '../src/index.js';
import { parseMerchants, parsePlans } from '../src/loader.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});

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

describe('optional catalogue fields', () => {
  it('omits merchant optional fields when they are missing or null', () => {
    const merchants = parseMerchants([
      {
        key: 'omitted',
        canonical_name: 'Omitted Merchant',
        aliases: [],
        category: 'OTHER_SUBSCRIPTION',
      },
      {
        key: 'null-fields',
        canonical_name: 'Null Fields Merchant',
        aliases: [],
        category: 'OTHER_SUBSCRIPTION',
        website: null,
        category_hue: null,
      },
    ]);

    expect(merchants).toHaveLength(2);
    for (const merchant of merchants) {
      expect(Object.hasOwn(merchant, 'website')).toBe(false);
      expect(Object.hasOwn(merchant, 'categoryHue')).toBe(false);
      expect(merchant.website).toBeUndefined();
      expect(merchant.categoryHue).toBeUndefined();
    }
  });

  it('retains valid merchant optional values', () => {
    const [merchant] = parseMerchants([
      {
        key: 'complete',
        canonical_name: 'Complete Merchant',
        aliases: [],
        category: 'OTHER_SUBSCRIPTION',
        website: 'https://example.test',
        category_hue: 120,
      },
    ]);

    expect(merchant).toMatchObject({ website: 'https://example.test', categoryHue: 120 });
  });

  it('omits undefined plan pricing for omitted or null amount_minor and retains valid values', () => {
    const plans = parsePlans([
      { merchant_key: 'merchant', name: 'Omitted price', period: 'MONTHLY', currency: 'SEK' },
      { merchant_key: 'merchant', name: 'Variable price', period: 'MONTHLY', currency: 'SEK', amount_minor: null },
      { merchant_key: 'merchant', name: 'Fixed price', period: 'MONTHLY', currency: 'SEK', amount_minor: 9900 },
    ], new Set(['merchant']));

    expect(plans).toHaveLength(3);
    expect(Object.hasOwn(plans[0] ?? {}, 'amountMinor')).toBe(false);
    expect(Object.hasOwn(plans[1] ?? {}, 'amountMinor')).toBe(false);
    expect(plans[0]?.amountMinor).toBeUndefined();
    expect(plans[1]?.amountMinor).toBeUndefined();
    expect(plans[2]?.amountMinor).toBe(9900);
  });
});

describe('catalogue loader validation', () => {
  const merchantErrors: ReadonlyArray<readonly [string, unknown, string]> = [
    ['rejects non-array merchant input', null, 'merchants.yaml must be an array'],
    ['rejects a non-object merchant row', [null], 'merchants.yaml[0]: must be an object'],
    ['rejects a missing merchant key', [{ key: '', canonical_name: 'Name', aliases: [], category: 'OTHER_SUBSCRIPTION' }], "missing required field 'key'"],
    ['rejects a missing canonical name', [{ key: 'merchant', canonical_name: '', aliases: [], category: 'OTHER_SUBSCRIPTION' }], "missing required field 'canonical_name'"],
    ['rejects aliases that are not an array', [{ key: 'merchant', canonical_name: 'Name', aliases: 'name', category: 'OTHER_SUBSCRIPTION' }], "'aliases' must be an array"],
    ['rejects a missing category', [{ key: 'merchant', canonical_name: 'Name', aliases: [], category: '' }], "missing required field 'category'"],
  ];

  for (const [label, raw, expectedError] of merchantErrors) {
    it(label, () => expect(() => parseMerchants(raw)).toThrow(expectedError));
  }

  const planErrors: ReadonlyArray<readonly [string, unknown, string]> = [
    ['rejects non-array plan input', undefined, 'plans.yaml must be an array'],
    ['rejects a non-object plan row', [false], 'plans.yaml[0]: must be an object'],
    ['rejects a missing merchant key', [{ merchant_key: '', name: 'Plan', period: 'MONTHLY', currency: 'SEK' }], "missing required field 'merchant_key'"],
    ['rejects an unknown merchant key', [{ merchant_key: 'unknown', name: 'Plan', period: 'MONTHLY', currency: 'SEK' }], "unknown merchant_key 'unknown'"],
    ['rejects a missing plan name', [{ merchant_key: 'merchant', name: '', period: 'MONTHLY', currency: 'SEK' }], "missing required field 'name'"],
    ['rejects an invalid period', [{ merchant_key: 'merchant', name: 'Plan', period: 'DAILY', currency: 'SEK' }], "invalid period 'DAILY'"],
    ['rejects a malformed currency code', [{ merchant_key: 'merchant', name: 'Plan', period: 'MONTHLY', currency: 'SE' }], "'currency' must be a 3-letter ISO code"],
  ];

  for (const [label, raw, expectedError] of planErrors) {
    it(label, () => expect(() => parsePlans(raw, new Set(['merchant']))).toThrow(expectedError));
  }

  it('applies plan defaults and normalizes provided region and currency values', () => {
    const [plan] = parsePlans([
      { merchant_key: 'merchant', name: 'Plan', period: 'MONTHLY', amount_minor: '9900', currency: 'sek', region: 'se', active: false },
    ], new Set(['merchant']));

    expect(plan).toMatchObject({ amountMinor: 9900, currency: 'SEK', region: 'SE', active: false });

    const [defaulted] = parsePlans([
      { merchant_key: 'merchant', name: 'Variable plan', period: 'MONTHLY', currency: 'SEK' },
    ], new Set(['merchant']));

    expect(defaulted).toMatchObject({ currency: 'SEK', region: 'GLOBAL', active: true });
    expect(Object.hasOwn(defaulted ?? {}, 'amountMinor')).toBe(false);
  });

  it('rejects duplicate merchant keys before reading plans', () => {
    const duplicateMerchants = [
      '- key: duplicate', '  canonical_name: First', '  aliases: []', '  category: OTHER_SUBSCRIPTION',
      '- key: duplicate', '  canonical_name: Second', '  aliases: []', '  category: OTHER_SUBSCRIPTION',
    ].join('\n');
    vi.mocked(readFileSync).mockImplementationOnce(() => duplicateMerchants as never);
    clearCatalogCache();

    expect(() => loadCatalog()).toThrow('Duplicate merchant keys: duplicate');
    clearCatalogCache();
  });

  it('rejects duplicate canonical names before reading plans', () => {
    const duplicateCanonicalNames = [
      '- key: first', '  canonical_name: Same Name', '  aliases: []', '  category: OTHER_SUBSCRIPTION',
      '- key: second', '  canonical_name: Same Name', '  aliases: []', '  category: OTHER_SUBSCRIPTION',
    ].join('\n');
    vi.mocked(readFileSync).mockImplementationOnce(() => duplicateCanonicalNames as never);
    clearCatalogCache();

    expect(() => loadCatalog()).toThrow('Duplicate canonical_name values: Same Name');
    clearCatalogCache();
  });
});
