import { en, sv } from './signatureComponents';

function collectKeyPaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, nested]) => collectKeyPaths(nested, prefix ? `${prefix}.${key}` : key),
  );
}

function icuPlaceholders(value: string): string[] {
  return [...value.matchAll(/%\{(\w+)\}/g)]
    .map((match) => match[1])
    .filter((name): name is string => typeof name === 'string')
    .sort();
}

describe('signatureComponents i18n parity', () => {
  it('has identical nested key sets for sv and en', () => {
    expect(collectKeyPaths(sv).sort()).toEqual(collectKeyPaths(en).sort());
  });

  it('has matching interpolation placeholders per key', () => {
    const enPaths = collectKeyPaths(en);
    const readAt = (root: unknown, path: string): string =>
      path.split('.').reduce<unknown>(
        (node, key) => (node as Record<string, unknown>)[key],
        root,
      ) as string;
    for (const path of enPaths) {
      expect(icuPlaceholders(readAt(sv, path))).toEqual(icuPlaceholders(readAt(en, path)));
    }
  });
});
