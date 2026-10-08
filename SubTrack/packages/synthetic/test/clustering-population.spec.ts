import { describe, expect, it } from 'vitest';
import {
  CLUSTERING_FEATURE_NAMES,
  CLUSTERING_CATEGORY_CODES,
} from '@subtrack/domain/clustering';
import { createClusteringPopulation } from '../src/clustering-population.js';

describe('createClusteringPopulation', () => {
  it('returns deterministic, dimensionally fixed, deeply frozen features', () => {
    const result = createClusteringPopulation({ seed: 'demo', households: 32 });
    expect(result).toEqual(
      createClusteringPopulation({ seed: 'demo', households: 32 }),
    );
    expect(result.featureNames).toBe(CLUSTERING_FEATURE_NAMES);
    expect(result.features).toHaveLength(32);
    expect(
      result.features.every(
        (row) => row.length === 25 && row.every(Number.isFinite),
      ),
    ).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.features)).toBe(true);
    expect(result.features.every(Object.isFrozen)).toBe(true);
    expect(
      result.features.every((row) => row[22]! >= 2 && row[22]! <= 20),
    ).toBe(true);
    expect(
      result.features.every((row) => row[23]! >= 0.049 && row[23]! <= 0.799),
    ).toBe(true);
    expect(result.features.every((row) => row[24]! >= 0 && row[24]! <= 1)).toBe(
      true,
    );
  });

  it('changes with the seed and keeps a stable prefix across population sizes', () => {
    const short = createClusteringPopulation({ seed: 'alpha', households: 12 });
    const long = createClusteringPopulation({ seed: 'alpha', households: 20 });
    const other = createClusteringPopulation({ seed: 'beta', households: 12 });
    expect(long.features.slice(0, 12)).toEqual(short.features);
    expect(other.features).not.toEqual(short.features);
  });

  it('produces varied categories and cadences without exposing rows or identifiers', () => {
    const result = createClusteringPopulation({ seed: 'mix', households: 100 });
    const categoryUse = CLUSTERING_CATEGORY_CODES.map((_, index) =>
      result.features.some((row) => row[index]! > 0),
    );
    const annualShares = result.features.map((row) => row[24]!);
    expect(categoryUse.filter(Boolean).length).toBeGreaterThan(10);
    expect(annualShares.some((share) => share > 0)).toBe(true);
    expect(annualShares.some((share) => share < 1)).toBe(true);
    expect(Object.keys(result).sort()).toEqual(['featureNames', 'features']);
  });

  it('enforces strict config without invoking accessors', () => {
    let invoked = false;
    const accessor = Object.defineProperty({}, 'seed', {
      enumerable: true,
      get() {
        invoked = true;
        return 'bad';
      },
    });
    expect(() =>
      createClusteringPopulation(accessor as { seed: string }),
    ).toThrow();
    expect(invoked).toBe(false);
    expect(() =>
      createClusteringPopulation({ seed: 'x', households: undefined } as never),
    ).toThrow();
    expect(() =>
      createClusteringPopulation({ seed: 'x', households: 5001 }),
    ).toThrow();
    expect(() =>
      createClusteringPopulation({ seed: '', households: 1 }),
    ).toThrow();
    expect(() =>
      createClusteringPopulation({ seed: 'x', extra: true } as never),
    ).toThrow();
    expect(() =>
      createClusteringPopulation(
        Object.assign(Object.create(null), { seed: 'x', households: 1 }),
      ),
    ).not.toThrow();
  });

  it.each([
    ['null', null],
    ['array', []],
    ['primitive', 'seed'],
    ['missing seed', {}],
    ['wrong seed type', { seed: 1 }],
    ['oversized seed', { seed: 'x'.repeat(129) }],
    [
      'nonplain config',
      new (class {
        seed = 'x';
      })(),
    ],
    ['symbol field', { seed: 'x', [Symbol('extra')]: true }],
    ['nonenumerable seed', Object.defineProperty({}, 'seed', { value: 'x' })],
    ['noninteger size', { seed: 'x', households: 1.5 }],
    ['string size', { seed: 'x', households: '2' }],
    ['zero size', { seed: 'x', households: 0 }],
    ['negative size', { seed: 'x', households: -1 }],
    ['NaN size', { seed: 'x', households: NaN }],
    ['infinite size', { seed: 'x', households: Infinity }],
  ])('rejects %s', (_label, input) => {
    expect(() => createClusteringPopulation(input as never)).toThrow();
  });

  it('rejects household accessors without invoking them and accepts the smallest population', () => {
    let calls = 0;
    const config = Object.defineProperty({ seed: 'x' }, 'households', {
      enumerable: true,
      get() {
        calls += 1;
        return 1;
      },
    });
    expect(() => createClusteringPopulation(config)).toThrow();
    expect(calls).toBe(0);
    expect(
      createClusteringPopulation({ seed: 'x', households: 1 }).features,
    ).toHaveLength(1);
  });

  it('uses the validated configuration snapshot rather than later property reads', () => {
    const config = new Proxy(
      { seed: 'snapshot', households: 3 },
      {
        get() {
          throw new Error(
            'Configuration must be read through data descriptors',
          );
        },
      },
    );
    expect(createClusteringPopulation(config)).toEqual(
      createClusteringPopulation({ seed: 'snapshot', households: 3 }),
    );
  });
});
