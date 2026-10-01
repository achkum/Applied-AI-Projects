import { describe, it, expect } from 'vitest';
import { createRng, generateDescriptors, normaliseDescriptor } from '../src/index.js';

describe('generateDescriptors()', () => {
  it('returns the requested count of descriptors', () => {
    const rng = createRng('desc-test');
    const variants = generateDescriptors('Netflix', rng, 4);
    expect(variants.length).toBe(4);
  });

  it('all descriptors reference the canonical name', () => {
    const rng = createRng('desc-canonical');
    const variants = generateDescriptors('Spotify', rng, 3);
    for (const v of variants) {
      expect(v.canonical).toBe('Spotify');
    }
  });

  it('raw descriptors are distinct', () => {
    const rng = createRng('desc-unique');
    const variants = generateDescriptors('Netflix', rng, 6);
    const raws = variants.map((v) => v.raw);
    const uniqueRaws = new Set(raws);
    expect(uniqueRaws.size).toBe(raws.length);
  });

  it('is deterministic with the same rng state', () => {
    const r1 = createRng('det-seed');
    const r2 = createRng('det-seed');
    const v1 = generateDescriptors('Netflix', r1, 3).map((v) => v.raw);
    const v2 = generateDescriptors('Netflix', r2, 3).map((v) => v.raw);
    expect(v1).toEqual(v2);
  });

  it('returns empty array for count=0', () => {
    const rng = createRng('empty');
    expect(generateDescriptors('Netflix', rng, 0)).toHaveLength(0);
  });

  it('raw values contain the merchant name in some form', () => {
    const rng = createRng('contains-name');
    const variants = generateDescriptors('Netflix', rng, 5);
    for (const v of variants) {
      expect(v.raw.toUpperCase()).toContain('NETFLIX');
    }
  });
});

describe('normaliseDescriptor()', () => {
  it('strips trailing *', () => {
    expect(normaliseDescriptor('NETFLIX*')).toBe('Netflix');
  });

  it('strips .COM suffix', () => {
    expect(normaliseDescriptor('NETFLIX.COM')).toBe('Netflix');
  });

  it('strips .SE suffix', () => {
    expect(normaliseDescriptor('SPOTIFY.SE')).toBe('Spotify');
  });

  it('strips AB suffix', () => {
    expect(normaliseDescriptor('SPOTIFY AB')).toBe('Spotify');
  });

  it('strips NORDIC suffix', () => {
    expect(normaliseDescriptor('NETFLIX NORDIC')).toBe('Netflix');
  });

  it('title-cases the result', () => {
    expect(normaliseDescriptor('AMAZON PRIME')).toBe('Amazon Prime');
  });

  it('strips year suffix', () => {
    expect(normaliseDescriptor('NETFLIX - 2025')).toBe('Netflix');
  });
});
