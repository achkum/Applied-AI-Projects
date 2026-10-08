import { add, money, multiply } from '@subtrack/money';

export const CLUSTERING_CATEGORY_CODES = Object.freeze([
  'VIDEO_STREAMING',
  'MUSIC_AUDIO',
  'AUDIOBOOKS_EBOOKS',
  'NEWS_MAGAZINES',
  'GAMING',
  'SOFTWARE_PRODUCTIVITY',
  'CLOUD_STORAGE',
  'AI_TOOLS',
  'MOBILE_PLAN',
  'BROADBAND_TV',
  'FITNESS_WELLNESS',
  'FOOD_MEALKITS',
  'TRANSPORT_MOBILITY',
  'HOME_SECURITY',
  'EDUCATION_KIDS',
  'PETS',
  'SHOPPING_MEMBERSHIPS',
  'VPN_SECURITY',
  'DONATIONS',
  'DATING_SOCIAL',
  'APP_STORE_BILLING',
  'OTHER_SUBSCRIPTION',
] as const);

export const CLUSTERING_FEATURE_NAMES = Object.freeze([
  ...CLUSTERING_CATEGORY_CODES,
  'subscriptionCount',
  'averageMonthlyPriceRelativeTo1000Sek',
  'annualShare',
] as const);

export type ClusteringCategoryCode = (typeof CLUSTERING_CATEGORY_CODES)[number];
export interface PersonaFeatureRow {
  readonly category: ClusteringCategoryCode;
  /** Positive SEK minor units, already monthly-normalized by the scoped caller. */
  readonly monthlyMinor: bigint;
  readonly cadence: 'monthly' | 'annual';
}

const MAX_ROWS = 10_000;
const MAX_MONTHLY_MINOR = 1_000_000_000_000n;
const SCALE = 1_000_000n;
const AVERAGE_REFERENCE_MINOR = 100_000n;
const CATEGORY_SET: ReadonlySet<string> = new Set(CLUSTERING_CATEGORY_CODES);
const ROW_KEYS = Object.freeze(['category', 'monthlyMinor', 'cadence']);

/**
 * Build a fixed-order offline clustering vector from caller-scoped, accepted rows.
 * Both cadences use the supplied monthlyMinor unchanged; callers resolve currency
 * and monthly-normalize before calling. This function does not authenticate scope.
 * Ratios use half-up integer rounding at 1e-6 precision. Only scaled,
 * dimensionless integers are converted to Number; monetary values remain bigint.
 */
export function buildPersonaFeatures(
  rows: readonly PersonaFeatureRow[],
): readonly number[] {
  if (!Array.isArray(rows)) throw new TypeError('rows must be an array');
  if (rows.length > MAX_ROWS)
    throw new RangeError(`rows must contain at most ${MAX_ROWS} entries`);

  const snapshot: PersonaFeatureRow[] = [];
  let total = money(0n, 'SEK');
  const categoryTotals = new Map<
    ClusteringCategoryCode,
    ReturnType<typeof money>
  >();
  let annualCount = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const arrayDescriptor = Object.getOwnPropertyDescriptor(
      rows,
      String(index),
    );
    if (arrayDescriptor === undefined || !('value' in arrayDescriptor)) {
      throw new TypeError(`row ${index} must be a data value`);
    }
    const candidate: unknown = arrayDescriptor.value;
    if (
      candidate === null ||
      typeof candidate !== 'object' ||
      Array.isArray(candidate)
    ) {
      throw new TypeError(`row ${index} must be a plain object`);
    }
    const prototype = Object.getPrototypeOf(candidate) as unknown;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`row ${index} must be a plain object`);
    }

    const ownKeys = Reflect.ownKeys(candidate);
    if (
      ownKeys.length !== ROW_KEYS.length ||
      ownKeys.some(
        (key) =>
          typeof key !== 'string' ||
          !(ROW_KEYS as readonly string[]).includes(key),
      )
    ) {
      throw new TypeError(`row ${index} has unsupported fields`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(candidate) as Record<
      string,
      PropertyDescriptor
    >;
    for (const key of ROW_KEYS) {
      const descriptor = descriptors[key];
      if (
        descriptor === undefined ||
        !('value' in descriptor) ||
        descriptor.enumerable !== true
      ) {
        throw new TypeError(
          `row ${index} fields must be enumerable data values`,
        );
      }
    }
    const category: unknown = descriptors.category?.value;
    const monthlyMinor: unknown = descriptors.monthlyMinor?.value;
    const cadence: unknown = descriptors.cadence?.value;
    if (typeof category !== 'string' || !CATEGORY_SET.has(category)) {
      throw new TypeError(`row ${index} has an unsupported category`);
    }
    if (typeof monthlyMinor !== 'bigint' || monthlyMinor <= 0n) {
      throw new TypeError(
        `row ${index} monthlyMinor must be a positive bigint`,
      );
    }
    if (monthlyMinor > MAX_MONTHLY_MINOR) {
      throw new RangeError(
        `row ${index} monthlyMinor exceeds the supported limit`,
      );
    }
    if (cadence !== 'monthly' && cadence !== 'annual') {
      throw new TypeError(`row ${index} has an unsupported cadence`);
    }

    const acceptedCategory = category as ClusteringCategoryCode;
    const acceptedCadence = cadence;
    const acceptedRow = Object.freeze({
      category: acceptedCategory,
      monthlyMinor,
      cadence: acceptedCadence,
    });
    snapshot.push(acceptedRow);
    const value = money(monthlyMinor, 'SEK');
    total = add(total, value);
    categoryTotals.set(
      acceptedCategory,
      add(categoryTotals.get(acceptedCategory) ?? money(0n, 'SEK'), value),
    );
    if (acceptedCadence === 'annual') annualCount += 1;
  }

  if (snapshot.length === 0)
    return Object.freeze(
      Array.from({ length: CLUSTERING_FEATURE_NAMES.length }, () => 0),
    );

  const denominator = total.minorUnits;
  const features: number[] = CLUSTERING_CATEGORY_CODES.map((category) =>
    ratio(categoryTotals.get(category)?.minorUnits ?? 0n, denominator),
  );
  features.push(snapshot.length);
  const average = multiply(total, 1n, BigInt(snapshot.length));
  features.push(ratio(average.minorUnits, AVERAGE_REFERENCE_MINOR));
  features.push(ratio(BigInt(annualCount), BigInt(snapshot.length)));
  return Object.freeze(features);
}

function ratio(numerator: bigint, denominator: bigint): number {
  const scaled = (numerator * SCALE * 2n + denominator) / (2n * denominator);
  // Bounds follow from positive shares/counts and monthlyMinor <= 1e12:
  // the largest average ratio scaled by SCALE is 1e13, below MAX_SAFE_INTEGER.
  return Number(scaled) / Number(SCALE);
}
