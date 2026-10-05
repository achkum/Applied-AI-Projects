import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { load as yamlLoad } from 'js-yaml';
import type { CatalogMerchant, CatalogPlan, BillingPeriod } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'data');

const VALID_PERIODS = new Set<BillingPeriod>([
  'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'IRREGULAR',
]);

export interface CatalogData {
  merchants: CatalogMerchant[];
  plans: CatalogPlan[];
}

/** @internal Exported for focused loader tests; not part of the package entry point. */
export function parseMerchants(raw: unknown): CatalogMerchant[] {
  if (!Array.isArray(raw)) throw new Error('merchants.yaml must be an array');
  return raw.map((item: unknown, i) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`merchants.yaml[${i}]: must be an object`);
    }
    const r = item as Record<string, unknown>;

    if (typeof r['key'] !== 'string' || !r['key']) {
      throw new Error(`merchants.yaml[${i}]: missing required field 'key'`);
    }
    if (typeof r['canonical_name'] !== 'string' || !r['canonical_name']) {
      throw new Error(`merchants.yaml[${i}]: missing required field 'canonical_name'`);
    }
    if (!Array.isArray(r['aliases'])) {
      throw new Error(`merchants.yaml[${i}]: 'aliases' must be an array`);
    }
    if (typeof r['category'] !== 'string' || !r['category']) {
      throw new Error(`merchants.yaml[${i}]: missing required field 'category'`);
    }

    return {
      key: r['key'] as string,
      canonicalName: r['canonical_name'] as string,
      aliases: r['aliases'] as string[],
      category: r['category'] as string,
      ...(typeof r['website'] === 'string' ? { website: r['website'] } : {}),
      ...(typeof r['category_hue'] === 'number' ? { categoryHue: r['category_hue'] } : {}),
    } satisfies CatalogMerchant;
  });
}

/** @internal Exported for focused loader tests; not part of the package entry point. */
export function parsePlans(raw: unknown, merchantKeys: Set<string>): CatalogPlan[] {
  if (!Array.isArray(raw)) throw new Error('plans.yaml must be an array');
  return raw.map((item: unknown, i) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`plans.yaml[${i}]: must be an object`);
    }
    const r = item as Record<string, unknown>;

    if (typeof r['merchant_key'] !== 'string' || !r['merchant_key']) {
      throw new Error(`plans.yaml[${i}]: missing required field 'merchant_key'`);
    }
    if (!merchantKeys.has(r['merchant_key'] as string)) {
      throw new Error(
        `plans.yaml[${i}]: unknown merchant_key '${r['merchant_key'] as string}'`,
      );
    }
    if (typeof r['name'] !== 'string' || !r['name']) {
      throw new Error(`plans.yaml[${i}]: missing required field 'name'`);
    }
    if (!VALID_PERIODS.has(r['period'] as BillingPeriod)) {
      throw new Error(
        `plans.yaml[${i}]: invalid period '${String(r['period'])}' — must be one of ${[...VALID_PERIODS].join(', ')}`,
      );
    }
    if (typeof r['currency'] !== 'string' || r['currency'].length !== 3) {
      throw new Error(`plans.yaml[${i}]: 'currency' must be a 3-letter ISO code`);
    }

    const amountMinor =
      r['amount_minor'] === null || r['amount_minor'] === undefined
        ? undefined
        : Number(r['amount_minor']);

    return {
      merchantKey: r['merchant_key'] as string,
      name: r['name'] as string,
      period: r['period'] as BillingPeriod,
      ...(amountMinor === undefined ? {} : { amountMinor }),
      currency: (r['currency'] as string).toUpperCase(),
      region: typeof r['region'] === 'string' ? (r['region'] as string).toUpperCase() : 'GLOBAL',
      active: r['active'] !== false,
    } satisfies CatalogPlan;
  });
}

let _cache: CatalogData | undefined;

/** Load and validate catalog YAML files. Returns cached data on subsequent calls. */
export function loadCatalog(): CatalogData {
  if (_cache) return _cache;

  const merchantsRaw = yamlLoad(readFileSync(path.join(DATA_DIR, 'merchants.yaml'), 'utf8'));
  const merchants = parseMerchants(merchantsRaw);

  const keys = new Set(merchants.map((m) => m.key));
  const dups = merchants.filter((m, i) => merchants.findIndex((x) => x.key === m.key) !== i);
  if (dups.length > 0) {
    throw new Error(`Duplicate merchant keys: ${dups.map((d) => d.key).join(', ')}`);
  }

  const canonDups = merchants.filter(
    (m, i) => merchants.findIndex((x) => x.canonicalName === m.canonicalName) !== i,
  );
  if (canonDups.length > 0) {
    throw new Error(
      `Duplicate canonical_name values: ${canonDups.map((d) => d.canonicalName).join(', ')}`,
    );
  }

  const plansRaw = yamlLoad(readFileSync(path.join(DATA_DIR, 'plans.yaml'), 'utf8'));
  const plans = parsePlans(plansRaw, keys);

  _cache = { merchants, plans };
  return _cache;
}

/** Clear the in-memory cache (useful in tests). */
export function clearCatalogCache(): void {
  _cache = undefined;
}
