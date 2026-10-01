/** Billing period values matching the `billing_period` enum in the DB. */
export type BillingPeriod = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'IRREGULAR';

/**
 * One row in the `merchant` table.
 * `key` is a stable seed identifier (NOT stored in DB; DB uses UUID).
 */
export interface CatalogMerchant {
  /** Stable slug key for cross-referencing in plans.yaml. */
  key: string;
  /** Unique canonical display name (max 120 chars). */
  canonicalName: string;
  /** Known bank-statement descriptor variants. */
  aliases: string[];
  /** Canonical website URL. */
  website?: string;
  /**
   * Category code from packages/ui-tokens/src/categories.json.
   * SCREAMING_SNAKE_CASE, e.g. "VIDEO_STREAMING".
   */
  category: string;
  /**
   * OKLCH hue (0–360) for the category colour in the UI.
   * Maps to the `category_hue` DOUBLE PRECISION column in `merchant`.
   */
  categoryHue?: number;
}

/**
 * One row in the `catalogue_plan` table.
 * `merchantKey` references `CatalogMerchant.key` (resolved to a UUID at seed time).
 */
export interface CatalogPlan {
  /** Matches CatalogMerchant.key. */
  merchantKey: string;
  /** Plan display name (max 120 chars). */
  name: string;
  period: BillingPeriod;
  /**
   * Amount in minor units (öre for SEK).
   * `undefined` = pricing varies / enterprise / contact sales.
   */
  amountMinor?: number;
  /** ISO 4217 currency code. */
  currency: string;
  /** Region tag, e.g. "SE", "EU", "GLOBAL". */
  region: string;
  active: boolean;
}
