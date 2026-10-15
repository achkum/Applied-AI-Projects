import type {PrivateOwnerPage, PrivateOwnerSubscriptionView} from '../../../../packages/contracts/generated/types.gen';
import {money, add, type Money} from '../../../../packages/money/src/money';

export type CompleteOwnerSubscriptions = PrivateOwnerPage & Readonly<{nextCursor: null}>;
export type OwnerSubscriptionLabels = Readonly<{
  categories: Readonly<Record<string, string>>;
  categoryFallback: string;
  unnamed: string;
}>;
export type OwnerSubscriptionSubtotal = Readonly<{
  cadence: PrivateOwnerSubscriptionView['cadence'];
  amount: Money;
}>;
export type OwnerSubscriptionGroup = Readonly<{
  categoryCode: string | null;
  label: string;
  items: readonly PrivateOwnerSubscriptionView[];
  totals: readonly OwnerSubscriptionSubtotal[];
}>;
export type OwnerSubscriptionProjection = Readonly<{
  groups: readonly OwnerSubscriptionGroup[];
  filteredCount: number;
  totalCount: number;
}>;

const unavailable = () => new Error('Private subscription list unavailable');
const cadenceOrder: readonly PrivateOwnerSubscriptionView['cadence'][] = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL', 'CUSTOM'];

/** The caller retains its existing token, transport, per-page policy and session fences. */
export async function readAllOwnerSubscriptions(
  readPage: (cursor?: string) => Promise<PrivateOwnerPage>,
  signal: AbortSignal,
): Promise<CompleteOwnerSubscriptions> {
  const items: PrivateOwnerSubscriptionView[] = [];
  const ids = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  for (;;) {
    if (signal.aborted) throw unavailable();
    const page = await readPage(cursor);
    if (signal.aborted) throw unavailable();
    for (const item of page.items) {
      if (ids.has(item.id)) throw unavailable();
      ids.add(item.id);
      items.push(item);
    }
    if (page.nextCursor === null) return {items, nextCursor: null};
    if (cursors.has(page.nextCursor)) throw unavailable();
    cursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
}

// Normalize composed/compatibility forms; fold sharp S and Greek final sigma for caseless search.
function searchText(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/ß/g, 'ss').replace(/ς/g, 'σ');
}

function expectedTotals(items: readonly PrivateOwnerSubscriptionView[]): readonly OwnerSubscriptionSubtotal[] {
  const totals = new Map<string, OwnerSubscriptionSubtotal>();
  for (const item of items) {
    if (item.status !== 'ACTIVE') continue;
    const value = money(BigInt(item.expectedAmountMinor), item.currency);
    const key = `${value.currency}:${item.cadence}`;
    const previous = totals.get(key);
    totals.set(key, {cadence: item.cadence, amount: add(previous?.amount ?? money(0n, value.currency), value)});
  }
  return [...totals.values()].sort((a, b) => a.amount.currency.localeCompare(b.amount.currency)
    || cadenceOrder.indexOf(a.cadence) - cadenceOrder.indexOf(b.cadence));
}

/**
 * Consumes typed rows already decoded by the caller's unchanged owner transport.
 * Category fallback is defensive presentation, not acceptance of new wire categories.
 * Subtotals describe only visible matching ACTIVE rows, per saved cycle and currency.
 */
export function projectOwnerSubscriptions(
  items: readonly PrivateOwnerSubscriptionView[],
  query: string,
  labels: OwnerSubscriptionLabels,
): OwnerSubscriptionProjection {
  const ids = new Set<string>();
  const matching = new Map<string | null, PrivateOwnerSubscriptionView[]>();
  const needle = searchText(query.trim());
  let filteredCount = 0;
  for (const item of items) {
    if (item.visibility !== 'owner' || ids.has(item.id)) throw unavailable();
    ids.add(item.id);
    if (!/^[A-Z]{3}$/.test(item.currency)) throw unavailable();
    if (typeof item.expectedAmountMinor !== 'string' || !/^(?:0|-?[1-9]\d*)$/.test(item.expectedAmountMinor)) throw unavailable();
    const minor = BigInt(item.expectedAmountMinor);
    if (minor < -9223372036854775808n || minor > 9223372036854775807n) throw unavailable();
    const categoryCode = Object.prototype.hasOwnProperty.call(labels.categories, item.categoryCode) ? item.categoryCode : null;
    const category = categoryCode === null ? labels.categoryFallback : labels.categories[categoryCode]!;
    const name = item.customName ?? item.merchantName ?? labels.unnamed;
    if (needle && !searchText(name).includes(needle) && !searchText(category).includes(needle)) continue;
    const group = matching.get(categoryCode) ?? [];
    group.push(item);
    matching.set(categoryCode, group);
    filteredCount += 1;
  }
  const groups: OwnerSubscriptionGroup[] = [];
  for (const categoryCode of [...Object.keys(labels.categories), null]) {
    const rows = matching.get(categoryCode);
    if (!rows) continue;
    groups.push({categoryCode, label: categoryCode === null ? labels.categoryFallback : labels.categories[categoryCode]!, items: rows, totals: expectedTotals(rows)});
  }
  return {groups, filteredCount, totalCount: items.length};
}
