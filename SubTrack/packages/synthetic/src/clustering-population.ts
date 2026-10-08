import {
  buildPersonaFeatures,
  CLUSTERING_CATEGORY_CODES,
  CLUSTERING_FEATURE_NAMES,
  type ClusteringCategoryCode,
  type PersonaFeatureRow,
} from '@subtrack/domain/clustering';
import { createRng } from './rng.js';

export interface ClusteringPopulationConfig {
  readonly seed: string;
  readonly households?: number;
}

export interface ClusteringPopulation {
  readonly featureNames: typeof CLUSTERING_FEATURE_NAMES;
  readonly features: readonly (readonly number[])[];
}

const CATEGORY_GROUPS = Object.freeze({
  media: Object.freeze([
    'VIDEO_STREAMING',
    'MUSIC_AUDIO',
    'AUDIOBOOKS_EBOOKS',
    'NEWS_MAGAZINES',
    'GAMING',
    'APP_STORE_BILLING',
  ] as const),
  work: Object.freeze([
    'SOFTWARE_PRODUCTIVITY',
    'CLOUD_STORAGE',
    'AI_TOOLS',
    'VPN_SECURITY',
  ] as const),
  household: Object.freeze([
    'MOBILE_PLAN',
    'BROADBAND_TV',
    'FOOD_MEALKITS',
    'TRANSPORT_MOBILITY',
    'HOME_SECURITY',
    'EDUCATION_KIDS',
    'PETS',
    'SHOPPING_MEMBERSHIPS',
  ] as const),
  personal: Object.freeze([
    'FITNESS_WELLNESS',
    'DONATIONS',
    'DATING_SOCIAL',
  ] as const),
  other: Object.freeze(['OTHER_SUBSCRIPTION'] as const),
});

type Group = keyof typeof CATEGORY_GROUPS;
const TEMPLATES: readonly (readonly [Group, Group])[] = Object.freeze([
  Object.freeze(['media', 'work'] as const),
  Object.freeze(['work', 'media'] as const),
  Object.freeze(['household', 'personal'] as const),
  Object.freeze(['personal', 'household'] as const),
  Object.freeze(['other', 'media'] as const),
]);
const ILLUSTRATIVE_MONTHLY_PRICES = Object.freeze([
  4900n,
  9900n,
  14900n,
  19900n,
  29900n,
  49900n,
  79900n,
]);
const CATEGORY_NOISE: readonly ClusteringCategoryCode[] =
  CLUSTERING_CATEGORY_CODES;
const CONFIG_KEYS = Object.freeze(['seed', 'households']);

function validateConfig(
  config: unknown,
): Readonly<Required<ClusteringPopulationConfig>> {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('config must be a plain object');
  }
  const prototype = Object.getPrototypeOf(config) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('config must be a plain object');
  }
  const keys = Reflect.ownKeys(config);
  if (
    keys.some((key) => typeof key !== 'string' || !CONFIG_KEYS.includes(key))
  ) {
    throw new TypeError('config has unsupported fields');
  }
  const descriptors = Object.getOwnPropertyDescriptors(config) as Record<
    string,
    PropertyDescriptor
  >;
  for (const key of keys) {
    const descriptor = descriptors[key as string];
    if (
      descriptor === undefined ||
      !('value' in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw new TypeError('config fields must be enumerable data values');
    }
  }
  const seed = descriptors.seed?.value as unknown;
  if (typeof seed !== 'string' || seed.length === 0 || seed.length > 128) {
    throw new TypeError(
      'seed must be a nonempty string of at most 128 characters',
    );
  }
  let householdCount = 5000;
  if (Object.hasOwn(config, 'households')) {
    const households = descriptors.households?.value as unknown;
    if (
      typeof households !== 'number' ||
      !Number.isInteger(households) ||
      households < 1 ||
      households > 5000
    ) {
      throw new RangeError('households must be an integer from 1 through 5000');
    }
    householdCount = households;
  }
  return Object.freeze({ seed, households: householdCount });
}

/** Generate dimensionless feature vectors from a lightweight statistical recipe. */
export function createClusteringPopulation(
  config: Readonly<ClusteringPopulationConfig>,
): ClusteringPopulation {
  const snapshot = validateConfig(config);
  const householdCount = snapshot.households;
  const features: (readonly number[])[] = [];

  for (let index = 0; index < householdCount; index += 1) {
    const rng = createRng(
      JSON.stringify([
        'subtrack:clustering-population:v1',
        snapshot.seed,
        index,
      ]),
    );
    const [primary, secondary] = rng.pick(TEMPLATES);
    const count = rng.nextInt(2, 20);
    const rows: PersonaFeatureRow[] = [];
    for (let row = 0; row < count; row += 1) {
      const draw = rng.nextInt(1, 100);
      const category =
        draw <= 70
          ? rng.pick(CATEGORY_GROUPS[primary])
          : draw <= 90
            ? rng.pick(CATEGORY_GROUPS[secondary])
            : rng.pick(CATEGORY_NOISE);
      rows.push(
        Object.freeze({
          category,
          monthlyMinor: rng.pick(ILLUSTRATIVE_MONTHLY_PRICES),
          cadence: rng.nextInt(1, 100) <= 20 ? 'annual' : 'monthly',
        }),
      );
    }
    features.push(buildPersonaFeatures(rows));
  }

  return Object.freeze({
    featureNames: CLUSTERING_FEATURE_NAMES,
    features: Object.freeze(features),
  });
}
