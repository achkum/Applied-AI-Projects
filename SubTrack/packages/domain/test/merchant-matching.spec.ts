import { describe, expect, it } from 'vitest';
import {
  matchMerchantDescriptor,
  normalizeMerchantDescriptor,
  type MerchantMatchCandidate,
} from '../merchant/index.js';

const catalogue: MerchantMatchCandidate[] = [
  { key: 'netflix', canonicalName: 'Netflix', aliases: ['NETFLIX.COM', 'Netflix International B.V.'] },
  { key: 'spotify', canonicalName: 'Spotify', aliases: ['Spotify AB'] },
];

describe('normalizeMerchantDescriptor', () => {
  it.each([
    ['  NETFLIX   INTERNATIONAL B.V.  ', 'netflix international b.v.'],
    ['ＮＥＴＦＬＩＸ.COM', 'netflix.com'],
    ['a\t\n b', 'a b'],
    ['Foo.COM', 'foo.com'],
    ['  ', ''],
  ])('normalizes %j to %j', (raw, expected) => {
    expect(normalizeMerchantDescriptor(raw)).toBe(expected);
  });
});

describe('matchMerchantDescriptor', () => {
  it('matches exact canonical names and explicit aliases', () => {
    expect(matchMerchantDescriptor('  NETFLIX ', catalogue)).toMatchObject({
      key: 'netflix', canonicalName: 'Netflix', matchedBy: 'canonicalName',
    });
    expect(matchMerchantDescriptor('netflix international b.v.', catalogue)).toMatchObject({
      key: 'netflix', canonicalName: 'Netflix', matchedBy: 'alias',
    });
  });

  it('preserves punctuation and only matches an explicit .COM alias', () => {
    expect(matchMerchantDescriptor('NETFLIX.COM', catalogue)?.key).toBe('netflix');
    expect(matchMerchantDescriptor('NETFLIX', [
      { key: 'n', canonicalName: 'Netflix', aliases: [] },
    ])?.key).toBe('n');
    expect(matchMerchantDescriptor('NETFLIXX.COM', catalogue)).toBeNull();
    expect(matchMerchantDescriptor('NETFLI', catalogue)).toBeNull();
    expect(matchMerchantDescriptor('Netflix Premium', catalogue)).toBeNull();
    expect(matchMerchantDescriptor('Netflix.com', [
      { key: 'n', canonicalName: 'Netflix', aliases: [] },
    ])).toBeNull();
  });

  it('returns null for unmatched, empty, and colliding descriptors', () => {
    expect(matchMerchantDescriptor('Unknown', catalogue)).toBeNull();
    expect(matchMerchantDescriptor(' \t ', catalogue)).toBeNull();
    expect(matchMerchantDescriptor('anything', [])).toBeNull();
    expect(matchMerchantDescriptor('same', [
      { key: 'a', canonicalName: 'First', aliases: ['SAME'] },
      { key: 'b', canonicalName: 'Second', aliases: [' same '] },
    ])).toBeNull();
  });

  it('resolves duplicate normalized entries owned by one merchant and is deterministic', () => {
    const sameMerchant = [
      { key: 'one', canonicalName: 'Same', aliases: [' SAME ', 'same'] },
      { key: 'one', canonicalName: 'Same', aliases: ['same'] },
    ];
    const original = '  SAME  ';
    const first = matchMerchantDescriptor(original, sameMerchant);
    expect(first?.key).toBe('one');
    expect(matchMerchantDescriptor(original, sameMerchant)).toEqual(first);
    expect(original).toBe('  SAME  ');
  });

  it('does not mutate a frozen catalogue or its alias lists', () => {
    const frozen = Object.freeze([
      Object.freeze({ key: 'n', canonicalName: 'Netflix', aliases: Object.freeze(['Netflix.com']) }),
    ]);
    expect(matchMerchantDescriptor('NETFLIX.COM', frozen)?.key).toBe('n');
    expect(frozen[0]?.aliases).toEqual(['Netflix.com']);
  });
});
