import en from '../catalogs/en.json';
import sv from '../catalogs/sv.json';

export { en, sv };
export type Locale = 'en' | 'sv';
export type Catalog = typeof en;
export const catalogs: Record<Locale, Catalog> = { en, sv };
