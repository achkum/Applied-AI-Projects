import { describe, it, expect } from 'vitest';
import { createRng } from '../src/index.js';

describe('createRng', () => {
  it('is deterministic — same seed produces same sequence', () => {
    const r1 = createRng('test-seed');
    const r2 = createRng('test-seed');
    const seq1 = Array.from({ length: 10 }, () => r1.next());
    const seq2 = Array.from({ length: 10 }, () => r2.next());
    expect(seq1).toEqual(seq2);
  });

  it('different seeds produce different sequences', () => {
    const r1 = createRng('seed-a');
    const r2 = createRng('seed-b');
    const seq1 = Array.from({ length: 5 }, () => r1.next());
    const seq2 = Array.from({ length: 5 }, () => r2.next());
    expect(seq1).not.toEqual(seq2);
  });

  it('next() returns values in [0, 1)', () => {
    const rng = createRng('range-test');
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextInt returns values in [min, max] inclusive', () => {
    const rng = createRng('int-test');
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = rng.nextInt(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    // All 6 values should appear across 500 draws
    expect(seen.size).toBe(6);
  });

  it('nextInt with same bounds always returns that bound', () => {
    const rng = createRng('single');
    expect(rng.nextInt(5, 5)).toBe(5);
    expect(rng.nextInt(5, 5)).toBe(5);
  });

  it('pick returns an element from the array', () => {
    const rng = createRng('pick-test');
    const items = ['a', 'b', 'c', 'd'];
    for (let i = 0; i < 100; i++) {
      expect(items).toContain(rng.pick(items));
    }
  });

  it('pick is deterministic', () => {
    const items = [1, 2, 3, 4, 5];
    const r1 = createRng('pick-det');
    const r2 = createRng('pick-det');
    const p1 = Array.from({ length: 10 }, () => r1.pick(items));
    const p2 = Array.from({ length: 10 }, () => r2.pick(items));
    expect(p1).toEqual(p2);
  });

  it('shuffle returns all elements', () => {
    const rng = createRng('shuffle-test');
    const items = [1, 2, 3, 4, 5, 6];
    const shuffled = rng.shuffle(items);
    expect(shuffled.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('shuffle does not mutate the original array', () => {
    const rng = createRng('shuffle-immutable');
    const items = [1, 2, 3, 4, 5];
    const original = [...items];
    rng.shuffle(items);
    expect(items).toEqual(original);
  });

  it('nextGaussian produces values spread around the mean', () => {
    const rng = createRng('gauss-test');
    const values = Array.from({ length: 1000 }, () => rng.nextGaussian(100, 15));
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    expect(mean).toBeGreaterThan(95);
    expect(mean).toBeLessThan(105);
  });

  it('fork produces an independent child RNG with its own sequence', () => {
    const parent = createRng('parent');
    const child1 = parent.fork('child-a');
    const child2 = parent.fork('child-a');
    const seq1 = Array.from({ length: 5 }, () => child1.next());
    const seq2 = Array.from({ length: 5 }, () => child2.next());
    expect(seq1).toEqual(seq2);
  });

  it('fork with different labels produces different sequences', () => {
    const parent = createRng('parent');
    const c1 = parent.fork('label-x');
    const c2 = parent.fork('label-y');
    const s1 = Array.from({ length: 5 }, () => c1.next());
    const s2 = Array.from({ length: 5 }, () => c2.next());
    expect(s1).not.toEqual(s2);
  });
});
