/** Custom category labels travel in the existing bounded category_code column.
 * The explicit namespace prevents an unknown provider code becoming user content. */
export function customCategoryLabel(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('CUSTOM:')) return null;
  const label = value.slice(7);
  if (label.trim() !== label || label.normalize('NFC') !== label || [...label].length < 1 || [...label].length > 40 || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(label)) return null;
  return label;
}
export function createCustomCategory(label: string): string {
  const value = `CUSTOM:${label.trim().normalize('NFC')}`;
  if (customCategoryLabel(value) === null) throw new Error('category');
  return value;
}
