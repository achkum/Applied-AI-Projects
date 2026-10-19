import { createSandboxProjections } from './sandboxMobileProjections';
import { selectBillingMonth } from './privateMobileBillingMonth';
import { selectNativeRenewals } from './privateMobileRenewals';
const row = { id: '123e4567-e89b-42d3-a456-426614174000', revision: '1', source: 'MANUAL' as const, visibility: 'owner' as const, customName: 'Fiction', merchantId: null, merchantName: null, categoryCode: 'VIDEO_STREAMING', cadence: 'MONTHLY' as const, status: 'ACTIVE' as const, expectedAmountMinor: '9007199254740993', currency: 'SEK', nextChargeDate: '2026-03-28', alwaysPrivate: true };
function fixture() { const api = { readNativeProfile: jest.fn().mockResolvedValue({ profileComplete: true }), readNativeMode: jest.fn().mockResolvedValue({ mode: 'just-me' }), readNativeSubscriptions: jest.fn().mockResolvedValue({ items: [row], nextCursor: null }) }; return { api, projections: createSandboxProjections(api) }; }
it('projects the same persisted owner rows through canonical Money/Month/renewal selectors', async () => {
  const f = fixture(), month = { year: 2026, month: 3 }, now = new Date(2026, 2, 28, 12), signal = new AbortController().signal;
  expect(await f.projections.readBillingMonth('token', signal, month)).toEqual({ kind: 'ready', projection: selectBillingMonth([row], month) });
  expect(await f.projections.readNativeRenewals('token', signal, now)).toEqual({ kind: 'ready', groups: selectNativeRenewals([row], now) });
});
it('includes confirmed detected subscriptions without changing exact Money, date or status semantics', async () => {
  const f = fixture(), month = { year: 2026, month: 3 }, now = new Date(2026, 2, 28, 12), signal = new AbortController().signal;
  const detected = { ...row, id: '223e4567-e89b-42d3-a456-426614174000', source: 'DETECTED' as const, expectedAmountMinor: '12990' };
  const pending = { ...detected, id: '323e4567-e89b-42d3-a456-426614174000', status: 'DETECTED' as const };
  const undated = { ...detected, id: '423e4567-e89b-42d3-a456-426614174000', nextChargeDate: null };
  f.api.readNativeSubscriptions.mockResolvedValue({ items: [row, detected, pending, undated], nextCursor: null });
  const projection = selectBillingMonth([row, detected, pending, undated], month);
  expect(projection.totals).toEqual([{ minorUnits: 9007199254753983n, currency: 'SEK' }]);
  expect(projection.days[0]?.items.map(item => item.id)).toEqual([row.id, detected.id]);
  expect(projection.undatedDetections.map(item => item.id)).toEqual([undated.id]);
  expect(await f.projections.readBillingMonth('sandbox-token', signal, month)).toEqual({ kind: 'ready', projection });
  expect(await f.projections.readNativeRenewals('sandbox-token', signal, now)).toEqual({ kind: 'ready', groups: selectNativeRenewals([row, detected, pending, undated], now) });
  expect(f.api.readNativeSubscriptions.mock.calls.every(call => call[0] === 'sandbox-token' && call[1] === signal)).toBe(true);
});
it('does not read owner rows before profile/Just Me readiness', async () => {
  const f = fixture(); f.api.readNativeProfile.mockResolvedValue({ profileComplete: false }); expect(await f.projections.readBillingMonth('token', new AbortController().signal, { year: 2026, month: 3 })).toEqual({ kind: 'setup-required' }); expect(f.api.readNativeSubscriptions).not.toHaveBeenCalled();
  expect(await f.projections.readNativeRenewals('token',new AbortController().signal,new Date())).toEqual({kind:'setup-required'});
});
it('rejects pre-entry, profile and between-page abort and permits valid bounded pagination',async()=>{
 const f=fixture(),a=new AbortController();a.abort();await expect(f.projections.readBillingMonth('t',a.signal,{year:2026,month:3})).rejects.toThrow();
 const g=fixture(),b=new AbortController();g.api.readNativeMode.mockImplementation(async()=>{b.abort();return{mode:'just-me'};});await expect(g.projections.readBillingMonth('t',b.signal,{year:2026,month:3})).rejects.toThrow();
 const h=fixture();h.api.readNativeSubscriptions.mockResolvedValueOnce({items:[row],nextCursor:'next'}).mockResolvedValueOnce({items:[],nextCursor:null});expect((await h.projections.readBillingMonth('t',new AbortController().signal,{year:2026,month:3})).kind).toBe('ready');
 const i=fixture(),c=new AbortController();i.api.readNativeSubscriptions.mockImplementation(async()=>{const page={items:[row],get nextCursor(){c.abort();return'next';}};return page;});await expect(i.projections.readBillingMonth('t',c.signal,{year:2026,month:3})).rejects.toThrow();
});
it.each(['currency', 'visibility', 'duplicate', 'empty-loop', 'capacity'])('rejects unsupported or unbounded %s rows', async kind => {
  const f = fixture(); const items = kind === 'capacity' ? Array.from({ length: 51 }, (_, index) => ({ ...row, id: `${index}` })) : kind === 'duplicate' ? [row, row] : kind === 'empty-loop' ? [] : [{ ...row, source: 'DETECTED', ...(kind === 'currency' ? { currency: 'EUR' } : { alwaysPrivate: false }) }];
  f.api.readNativeSubscriptions.mockResolvedValue({ items, nextCursor: kind === 'empty-loop' ? 'next' : null }); await expect(f.projections.readBillingMonth('token', new AbortController().signal, { year: 2026, month: 3 })).rejects.toThrow();
});
it('rejects aborts resolving after a page response and repeated cursors', async () => {
  const f = fixture(), controller = new AbortController(); f.api.readNativeSubscriptions.mockImplementation(async () => { controller.abort(); return { items: [row], nextCursor: null }; }); await expect(f.projections.readBillingMonth('token', controller.signal, { year: 2026, month: 3 })).rejects.toThrow();
  const g = fixture(); g.api.readNativeSubscriptions.mockResolvedValue({ items: [row], nextCursor: 'same' }); await expect(g.projections.readBillingMonth('token', new AbortController().signal, { year: 2026, month: 3 })).rejects.toThrow();
});
