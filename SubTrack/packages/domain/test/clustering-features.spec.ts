import { describe, expect, it } from 'vitest';
import {
  buildPersonaFeatures,
  CLUSTERING_CATEGORY_CODES,
  CLUSTERING_FEATURE_NAMES,
  type PersonaFeatureRow,
} from '../clustering/index.js';

const row = (
  category: PersonaFeatureRow['category'],
  monthlyMinor: bigint,
  cadence: PersonaFeatureRow['cadence'] = 'monthly',
): PersonaFeatureRow => ({ category, monthlyMinor, cadence });

const vectorAt = (category: PersonaFeatureRow['category']) =>
  CLUSTERING_CATEGORY_CODES.indexOf(category);

describe('buildPersonaFeatures', () => {
  it('exports frozen stable schema and returns 25 finite frozen dimensions', () => {
    expect(Object.isFrozen(CLUSTERING_CATEGORY_CODES)).toBe(true);
    expect(Object.isFrozen(CLUSTERING_FEATURE_NAMES)).toBe(true);
    expect(CLUSTERING_FEATURE_NAMES).toHaveLength(25);
    expect(CLUSTERING_FEATURE_NAMES.slice(0, 22)).toEqual(
      CLUSTERING_CATEGORY_CODES,
    );
    const vector = buildPersonaFeatures([row('VIDEO_STREAMING', 1n)]);
    expect(Object.isFrozen(vector)).toBe(true);
    expect(vector).toHaveLength(25);
    expect(vector.every(Number.isFinite)).toBe(true);
  });

  it('uses category taxonomy order, spend shares, raw count and supplied mixed cadences', () => {
    const vector = buildPersonaFeatures([
      row('VIDEO_STREAMING', 100_000n, 'monthly'),
      row('MUSIC_AUDIO', 300_000n, 'annual'),
    ]);
    expect(vector[vectorAt('VIDEO_STREAMING')]).toBe(0.25);
    expect(vector[vectorAt('MUSIC_AUDIO')]).toBe(0.75);
    expect(vector[22]).toBe(2);
    expect(vector[23]).toBe(2);
    expect(vector[24]).toBe(0.5);
    expect(
      vector.slice(0, 22).reduce((sum, value) => sum + value, 0),
    ).toBeCloseTo(1, 5);
  });

  it('uses money multiply nearest-minor rounding and preserves tiny prices in dimensionless conversion', () => {
    const average = buildPersonaFeatures([
      row('VIDEO_STREAMING', 1n),
      row('MUSIC_AUDIO', 2n),
    ]);
    expect(average[23]).toBe(0.00002);
    const halfUp = buildPersonaFeatures([
      row('VIDEO_STREAMING', 100_000n),
      row('MUSIC_AUDIO', 100_001n),
    ]);
    expect(halfUp[23]).toBe(1.00001);
    const minimum = buildPersonaFeatures([row('VIDEO_STREAMING', 50_000n)]);
    expect(minimum[23]).toBe(0.5);
  });

  it('returns all zeros for empty rows and accepts the maximum row count', () => {
    expect(buildPersonaFeatures([])).toEqual(
      Array.from({ length: 25 }, () => 0),
    );
    const max = buildPersonaFeatures(
      Array.from({ length: 10_000 }, () => row('VIDEO_STREAMING', 1n)),
    );
    expect(max[22]).toBe(10_000);
    expect(max[vectorAt('VIDEO_STREAMING')]).toBe(1);
  });

  it('uses bigint arithmetic for aggregates above the safe integer range', () => {
    const vector = buildPersonaFeatures(
      Array.from({ length: 10_000 }, () =>
        row('VIDEO_STREAMING', 1_000_000_000_000n),
      ),
    );
    expect(vector[vectorAt('VIDEO_STREAMING')]).toBe(1);
    expect(vector[22]).toBe(10_000);
    expect(vector[23]).toBe(10_000_000);
  });

  it('does not mutate input rows and returns equal stable vectors', () => {
    const input = [row('VIDEO_STREAMING', 123_456n, 'annual')];
    const first = buildPersonaFeatures(input);
    const second = buildPersonaFeatures(input);
    expect(first).toEqual(second);
    expect(Object.isFrozen(input[0])).toBe(false);
  });

  it.each([
    ['non-array', null],
    ['null row', [null]],
    ['array row', [[1, 2, 3]]],
    [
      'class instance',
      [
        new (class {
          category = 'VIDEO_STREAMING';
          monthlyMinor = 1n;
          cadence = 'monthly';
        })(),
      ],
    ],
    [
      'unsupported category',
      [{ category: 'SALARY', monthlyMinor: 1n, cadence: 'monthly' }],
    ],
    [
      'wrong monthly type',
      [{ category: 'VIDEO_STREAMING', monthlyMinor: 1, cadence: 'monthly' }],
    ],
    ['zero price', [row('VIDEO_STREAMING', 0n)]],
    ['negative price', [row('VIDEO_STREAMING', -1n)]],
    [
      'unsupported cadence',
      [{ category: 'VIDEO_STREAMING', monthlyMinor: 1n, cadence: 'weekly' }],
    ],
    ['per-row limit', [row('VIDEO_STREAMING', 1_000_000_000_001n)]],
    [
      'extra string key',
      [
        {
          category: 'VIDEO_STREAMING',
          monthlyMinor: 1n,
          cadence: 'monthly',
          name: 'private',
        },
      ],
    ],
    [
      'symbol key',
      [
        Object.assign(row('VIDEO_STREAMING', 1n), {
          [Symbol('private')]: true,
        }),
      ],
    ],
    [
      'non-enumerable field',
      [
        Object.defineProperty(row('VIDEO_STREAMING', 1n), 'category', {
          value: 'VIDEO_STREAMING',
          enumerable: false,
        }),
      ],
    ],
    [
      'row accessor',
      [
        Object.defineProperty(
          { monthlyMinor: 1n, cadence: 'monthly' },
          'category',
          { get: () => 'VIDEO_STREAMING', enumerable: true },
        ),
      ],
    ],
    ['sparse array', Array(1)],
    [
      'too many rows',
      Array.from({ length: 10_001 }, () => row('VIDEO_STREAMING', 1n)),
    ],
  ])('rejects %s', (_label, input) => {
    expect(() => buildPersonaFeatures(input as never)).toThrow();
  });
});
