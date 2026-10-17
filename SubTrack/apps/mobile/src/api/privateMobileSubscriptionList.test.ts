import type {PrivateOwnerPage, PrivateOwnerSubscriptionView} from '../../../../packages/contracts/generated/types.gen';
import {parsePrivateOwnerPage} from '@subtrack/contracts/private-onboarding';
import {formatMinorUnits} from './privateMobileMoney';
import {projectOwnerSubscriptions, readAllOwnerSubscriptions, type OwnerSubscriptionLabels} from './privateMobileSubscriptionList';

const labels: OwnerSubscriptionLabels = {categories: {VIDEO_STREAMING: 'Video streaming', MUSIC_AUDIO: 'Music and audio'}, categoryFallback: 'Other subscriptions', unnamed: 'Unnamed subscription'};
const row = (index: number, patch: Partial<PrivateOwnerSubscriptionView> = {}): PrivateOwnerSubscriptionView => ({
  id: `123e4567-e89b-42d3-a456-${String(index).padStart(12, '0')}`, revision: '1', source: 'MANUAL', visibility: 'owner', customName: 'Saved service', merchantId: null, merchantName: null,
  categoryCode: 'VIDEO_STREAMING', cadence: 'MONTHLY', status: 'ACTIVE', expectedAmountMinor: '9007199254740993', currency: 'SEK', nextChargeDate: null, alwaysPrivate: true, ...patch,
});
const pageRows = (start: number) => Array.from({length: 50}, (_, i) => row(start + i));

it('reads through the terminal owner cursor before searching a second-page hit', async () => {
  const read = jest.fn<Promise<PrivateOwnerPage>, [string?]>()
    .mockResolvedValueOnce({items: pageRows(0), nextCursor: 'cursorA'})
    .mockResolvedValueOnce({items: [row(50, {customName: 'Second page target'})], nextCursor: null});
  const complete = await readAllOwnerSubscriptions(read, new AbortController().signal);
  expect(read.mock.calls).toEqual([[undefined], ['cursorA']]);
  expect(complete.nextCursor).toBeNull();expect(complete.items).toHaveLength(51);
  const projection = projectOwnerSubscriptions(complete.items, 'TARGET', labels);
  expect(projection.filteredCount).toBe(1);expect(projection.totalCount).toBe(51);expect(projection.groups[0]?.items[0]?.id).toBe(row(50).id);
});

it('refuses duplicate IDs within or between pages and repeated or longer cursor cycles', async () => {
  for (const pages of [
    [{items: [row(0), row(0)], nextCursor: null}],
    [{items: pageRows(0), nextCursor: 'cursorA'}, {items: [row(0)], nextCursor: null}],
    [{items: pageRows(0), nextCursor: 'cursorA'}, {items: pageRows(50), nextCursor: 'cursorA'}],
    [{items: pageRows(0), nextCursor: 'cursorA'}, {items: pageRows(50), nextCursor: 'cursorB'}, {items: pageRows(100), nextCursor: 'cursorA'}],
  ]) {
    const read = jest.fn<Promise<PrivateOwnerPage>, [string?]>();
    for (const page of pages) read.mockResolvedValueOnce(page);
    await expect(readAllOwnerSubscriptions(read, new AbortController().signal)).rejects.toThrow('Private subscription list unavailable');
  }
});

it('never returns partial or late results after cancellation or a failed later page', async () => {
  const before = new AbortController();before.abort();const unread = jest.fn<Promise<PrivateOwnerPage>, [string?]>();
  await expect(readAllOwnerSubscriptions(unread, before.signal)).rejects.toThrow();expect(unread).not.toHaveBeenCalled();
  const during = new AbortController();let finish: ((page: PrivateOwnerPage) => void) | undefined;
  const read = jest.fn<Promise<PrivateOwnerPage>, [string?]>().mockResolvedValueOnce({items: pageRows(0), nextCursor: 'cursorA'})
    .mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
  const pending = readAllOwnerSubscriptions(read, during.signal);await Promise.resolve();await Promise.resolve();
  expect(read).toHaveBeenCalledTimes(2);during.abort();finish!({items: [row(50)], nextCursor: null});await expect(pending).rejects.toThrow();
  const terminal = new AbortController();await expect(readAllOwnerSubscriptions(async () => {terminal.abort();return {items: [row(0)], nextCursor: null};}, terminal.signal)).rejects.toThrow();
  const failed = jest.fn<Promise<PrivateOwnerPage>, [string?]>().mockResolvedValueOnce({items: pageRows(0), nextCursor: 'cursorA'}).mockRejectedValueOnce(new Error('unavailable'));
  await expect(readAllOwnerSubscriptions(failed, new AbortController().signal)).rejects.toThrow();
});

it('searches displayed names and current localized category labels with Unicode, case, no-match and clear behavior', () => {
  const rows = [row(0, {customName: 'Straße CAFÉ'}), row(1, {customName: null, merchantName: 'ΟΔΥΣΣΕΎΣ', categoryCode: 'MUSIC_AUDIO'}), row(2, {customName: null, merchantName: null, categoryCode: 'OTHER_SUBSCRIPTION'})];
  for (const query of ['STRASSE', 'cafe\u0301', 'ＣＡＦÉ']) expect(projectOwnerSubscriptions(rows, query, labels).groups[0]?.items.map(item => item.id)).toEqual([row(0).id]);
  expect(projectOwnerSubscriptions(rows, 'οδυσσεύσ', labels).groups[0]?.items[0]?.id).toBe(row(1).id);
  expect(projectOwnerSubscriptions(rows, 'mUsIc', labels).groups[0]?.categoryCode).toBe('MUSIC_AUDIO');
  expect(projectOwnerSubscriptions(rows, 'unnamed', labels).groups[0]?.categoryCode).toBeNull();
  const swedish = {...labels, categories: {VIDEO_STREAMING: 'Film och serier', MUSIC_AUDIO: 'Musik och ljud'}, categoryFallback: 'Övriga abonnemang'};
  expect(projectOwnerSubscriptions(rows, 'FILM', swedish).filteredCount).toBe(1);expect(projectOwnerSubscriptions(rows, 'music', swedish).filteredCount).toBe(0);
  expect(projectOwnerSubscriptions(rows, 'unknown target', labels)).toEqual({groups: [], filteredCount: 0, totalCount: 3});
  expect(projectOwnerSubscriptions(rows, '   ', labels).filteredCount).toBe(3);expect(projectOwnerSubscriptions([], '', labels)).toEqual({groups: [], filteredCount: 0, totalCount: 0});
});

it('uses stable category groups, explicit fallback, original row order and visible inactive/general owner rows', () => {
  const rows = [row(0, {categoryCode: 'OTHER_SUBSCRIPTION', status: 'ARCHIVED'}), row(1, {categoryCode: 'MUSIC_AUDIO', source: 'DETECTED', currency: 'EUR'}), row(2, {status: 'PAUSED'}), row(3, {status: 'CANCELLED'}), row(4, {categoryCode: 'CLOUD_STORAGE', status: 'TRIAL'})];
  const projection = projectOwnerSubscriptions(rows, '', labels);
  expect(projection.groups.map(group => group.categoryCode)).toEqual(['VIDEO_STREAMING', 'MUSIC_AUDIO', null]);
  expect(projection.groups.map(group => group.items.map(item => item.id))).toEqual([[row(2).id, row(3).id], [row(1).id], [row(0).id, row(4).id]]);
  expect(projection.groups[0]?.totals).toEqual([]);expect(projection.groups[1]?.totals[0]?.amount.currency).toBe('EUR');expect(projection.groups[2]?.totals).toEqual([]);
  expect(projectOwnerSubscriptions(rows, 'other subscriptions', labels).filteredCount).toBe(2);
});

it('sums exact ACTIVE expected Money separately by currency and saved cadence without normalization', () => {
  const rows = [row(0, {expectedAmountMinor: '9223372036854775807'}), row(1, {expectedAmountMinor: '9223372036854775807'}), row(2, {expectedAmountMinor: '7', cadence: 'ANNUAL'}), row(3, {currency: 'EUR', expectedAmountMinor: '50'}), row(4, {currency: 'SEK', cadence: 'WEEKLY', expectedAmountMinor: '2'}), row(5, {currency: 'SEK', cadence: 'CUSTOM', expectedAmountMinor: '-3'}), row(6, {expectedAmountMinor: '999', status: 'PAUSED'}), row(7, {expectedAmountMinor: '999', status: 'CANCELLED'}), row(8, {expectedAmountMinor: '999', status: 'ARCHIVED'}), row(9, {expectedAmountMinor: '999', status: 'TRIAL'}), row(10, {expectedAmountMinor: '999', status: 'DETECTED'}), row(11, {expectedAmountMinor: '999', status: 'REJECTED'})];
  const totals = projectOwnerSubscriptions(rows, '', labels).groups[0]!.totals;
  expect(totals).toEqual([{cadence: 'MONTHLY', amount: {minorUnits: 50n, currency: 'EUR'}}, {cadence: 'WEEKLY', amount: {minorUnits: 2n, currency: 'SEK'}}, {cadence: 'MONTHLY', amount: {minorUnits: 18446744073709551614n, currency: 'SEK'}}, {cadence: 'ANNUAL', amount: {minorUnits: 7n, currency: 'SEK'}}, {cadence: 'CUSTOM', amount: {minorUnits: -3n, currency: 'SEK'}}]);
  expect(formatMinorUnits(totals[2]!.amount.minorUnits, 'SEK', {locale: 'en', display: 'code'}).replace(/\D/g, '')).toBe('18446744073709551614');
  const matching = projectOwnerSubscriptions([row(0, {customName: 'Visible', expectedAmountMinor: '10'}), row(1, {customName: 'Hidden', expectedAmountMinor: '20'})], 'visible', labels);
  expect(matching.groups[0]?.totals[0]?.amount.minorUnits).toBe(10n);
});

it('reprojects persisted rereads to changed groups, amounts and statuses while retaining the query', async () => {
  const before = projectOwnerSubscriptions([row(0, {customName: 'Find me', expectedAmountMinor: '10'})], 'find', labels);
  const saved = await readAllOwnerSubscriptions(async () => ({items: [row(0, {customName: 'Find me', categoryCode: 'MUSIC_AUDIO', cadence: 'ANNUAL', expectedAmountMinor: '15'})], nextCursor: null}), new AbortController().signal);
  const after = projectOwnerSubscriptions(saved.items, 'find', labels);
  expect(before.groups[0]?.categoryCode).toBe('VIDEO_STREAMING');expect(after.groups[0]?.categoryCode).toBe('MUSIC_AUDIO');expect(after.groups[0]?.totals).toEqual([{cadence: 'ANNUAL', amount: {minorUnits: 15n, currency: 'SEK'}}]);
  expect(projectOwnerSubscriptions([{...saved.items[0]!, status: 'PAUSED'}], 'find', labels).groups[0]?.totals).toEqual([]);
});

it('preserves unfamiliar supplied categories and original rows in fallback without changing strict transport acceptance', () => {
  const legacy = row(0, {categoryCode: 'LEGACY_CATEGORY', expectedAmountMinor: '20'}), inactive = row(1, {categoryCode: 'LEGACY_UNKNOWN', status: 'PAUSED'});
  const projection = projectOwnerSubscriptions([legacy, inactive], '', labels);
  expect(projection.groups).toHaveLength(1);expect(projection.groups[0]?.categoryCode).toBeNull();expect(projection.groups[0]?.label).toBe(labels.categoryFallback);
  expect(projection.groups[0]?.items[0]).toBe(legacy);expect(projection.groups[0]?.items[1]).toBe(inactive);expect(projection.groups[0]?.items.map(item => item.categoryCode)).toEqual(['LEGACY_CATEGORY', 'LEGACY_UNKNOWN']);
  expect(projection.groups[0]?.totals).toEqual([{cadence: 'MONTHLY', amount: {minorUnits: 20n, currency: 'SEK'}}]);
  expect(projectOwnerSubscriptions([legacy, inactive], 'other subscriptions', labels).filteredCount).toBe(2);
  expect(() => parsePrivateOwnerPage({items: [legacy], nextCursor: null})).toThrow();
});

it('rejects duplicate or malformed/foreign owner Money projections even when a query would hide them', () => {
  for (const rows of [[row(0), row(0)], [row(0, {visibility: 'household' as 'owner'})], [row(0, {currency: 'sek'})], [row(0, {expectedAmountMinor: 1 as unknown as string})], [row(0, {expectedAmountMinor: '1.2'})], [row(0, {expectedAmountMinor: '01'})], [row(0, {expectedAmountMinor: '-0'})], [row(0, {expectedAmountMinor: '9223372036854775808'})], [row(0, {expectedAmountMinor: '-9223372036854775809'})]]) expect(() => projectOwnerSubscriptions(rows, 'no match', labels)).toThrow();
  expect(projectOwnerSubscriptions([row(0, {expectedAmountMinor: '-9223372036854775808'})], '', labels).groups[0]?.totals[0]?.amount.minorUnits).toBe(-9223372036854775808n);
});
