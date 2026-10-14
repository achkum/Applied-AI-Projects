import {checkBillingMonth,currentBillingMonth,shiftBillingMonth,selectBillingMonth,readBillingMonth} from './privateMobileBillingMonth';
import * as api from './privateMobileApi';
jest.mock('./privateMobileApi',()=>({readNativeProfile:jest.fn(),readNativeMode:jest.fn(),readNativeSubscriptions:jest.fn()}));
const row={id:'123e4567-e89b-42d3-a456-426614174000',revision:'1',source:'MANUAL' as const,visibility:'owner' as const,customName:'Saved month service',merchantId:null,merchantName:null,categoryCode:'VIDEO_STREAMING',cadence:'MONTHLY' as const,status:'ACTIVE' as const,expectedAmountMinor:'9007199254740993',currency:'SEK',nextChargeDate:'2026-10-01',alwaysPrivate:true};
const month={year:2026,month:10};
beforeEach(()=>{jest.resetAllMocks();jest.mocked(api.readNativeProfile).mockResolvedValue({displayName:'Synthetic',avatarColourToken:null,avatarEmoji:null,language:'en',theme:'system',defaultCurrency:'SEK',profileComplete:true});jest.mocked(api.readNativeMode).mockResolvedValue({mode:'just-me'});});
it('uses real local calendar month and guarded year/month navigation',()=>{
 expect(currentBillingMonth(new Date(2026,9,1))).toEqual(month);expect(shiftBillingMonth({year:2026,month:12},1)).toEqual({year:2027,month:1});expect(shiftBillingMonth({year:2026,month:1},-1)).toEqual({year:2025,month:12});
 for(const bad of [null,{year:0,month:1},{year:10000,month:1},{year:2026.5,month:1},{year:2026,month:0},{year:2026,month:13},{year:2026,month:1.5}])expect(()=>checkBillingMonth(bad as typeof month)).toThrow();
 expect(()=>currentBillingMonth(new Date('bad'))).toThrow();expect(()=>currentBillingMonth(null as unknown as Date)).toThrow();expect(()=>shiftBillingMonth(month,0 as 1)).toThrow();expect(()=>shiftBillingMonth({year:1,month:1},-1)).toThrow();expect(()=>shiftBillingMonth({year:9999,month:12},1)).toThrow();
});
it('shows all ACTIVE saved dates in the calendar month, including earlier dates, sorted day and ID',()=>{
 const second={...row,id:'123e4567-e89b-42d3-a456-426614174001',expectedAmountMinor:'7'},later={...row,id:'123e4567-e89b-42d3-a456-426614174002',nextChargeDate:'2026-10-31'};
 const result=selectBillingMonth([later,second,row,{...row,id:'123e4567-e89b-42d3-a456-426614174003',nextChargeDate:null},{...row,id:'123e4567-e89b-42d3-a456-426614174004',status:'PAUSED'},{...row,id:'123e4567-e89b-42d3-a456-426614174005',nextChargeDate:'2026-11-01'}],month);
 expect(result.days.map(day=>day.date)).toEqual(['2026-10-01','2026-10-31']);expect(result.days[0]?.items.map(value=>value.id)).toEqual([row.id,second.id]);expect(result.totals).toEqual([{minorUnits:18014398509481993n,currency:'SEK'}]);
 expect(selectBillingMonth([{...row,nextChargeDate:'2024-02-29'}],{year:2024,month:2}).days[0]?.date).toBe('2024-02-29');
});
it('keeps exact totals currency-separated, empty/missing dates unknown, malformed/foreign projections rejected',()=>{
 const euro={...row,id:'123e4567-e89b-42d3-a456-426614174001',currency:'EUR',expectedAmountMinor:'50'};expect(selectBillingMonth([row,euro],month).totals).toEqual([{minorUnits:50n,currency:'EUR'},{minorUnits:9007199254740993n,currency:'SEK'}]);expect(selectBillingMonth([],month).totals).toEqual([]);
 for(const values of [[row,row],[{...row,nextChargeDate:'0000-01-01'}],[{...row,visibility:'household'}],[{...row,expectedAmountMinor:'1.2'}]])expect(()=>selectBillingMonth(values as typeof row[],month)).toThrow();
});
it('current profile/Just me gate precedes any subscription page',async()=>{
 for(const gate of ['profile','mode']){if(gate==='profile')jest.mocked(api.readNativeProfile).mockResolvedValueOnce({displayName:null,avatarColourToken:null,avatarEmoji:null,language:'en',theme:'system',defaultCurrency:'SEK',profileComplete:false});else jest.mocked(api.readNativeMode).mockResolvedValueOnce({mode:null});expect(await readBillingMonth('a.b.c',new AbortController().signal,month)).toEqual({kind:'setup-required'});expect(api.readNativeSubscriptions).not.toHaveBeenCalled();}
});
it('terminal owner pagination rejects duplicates/cycles and never projects partial or aborted rows',async()=>{
 jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:[],nextCursor:'cursorA'}).mockResolvedValueOnce({items:[row],nextCursor:null});expect((await readBillingMonth('a.b.c',new AbortController().signal,month)).kind).toBe('ready');
 for(const defect of ['duplicate','cursor']){jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:[row],nextCursor:'cursorA'}).mockResolvedValueOnce({items:defect==='duplicate'?[row]:[],nextCursor:defect==='cursor'?'cursorA':null});await expect(readBillingMonth('a.b.c',new AbortController().signal,month)).rejects.toThrow();}
 const before=new AbortController();before.abort();await expect(readBillingMonth('a.b.c',before.signal,month)).rejects.toThrow();
 const during=new AbortController();jest.mocked(api.readNativeSubscriptions).mockImplementationOnce(async()=>{during.abort();return {items:[row],nextCursor:null};});await expect(readBillingMonth('a.b.c',during.signal,month)).rejects.toThrow();
 const gated=new AbortController();jest.mocked(api.readNativeMode).mockImplementationOnce(async()=>{gated.abort();return {mode:'just-me'};});await expect(readBillingMonth('a.b.c',gated.signal,month)).rejects.toThrow();
});
