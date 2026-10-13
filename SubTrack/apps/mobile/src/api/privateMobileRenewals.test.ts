import {selectNativeRenewals,renewalDateDay,readNativeRenewals} from './privateMobileRenewals';
import * as api from './privateMobileApi';
jest.mock('./privateMobileApi',()=>({readNativeProfile:jest.fn(),readNativeMode:jest.fn(),readNativeSubscriptions:jest.fn()}));
const row={id:'123e4567-e89b-42d3-a456-426614174000',revision:'1',source:'MANUAL' as const,visibility:'owner' as const,customName:'Saved renewal',merchantId:null,merchantName:null,categoryCode:'VIDEO_STREAMING',cadence:'MONTHLY' as const,status:'ACTIVE' as const,expectedAmountMinor:'9007199254740993',currency:'SEK',nextChargeDate:'2026-03-28',alwaysPrivate:true};
const now=()=>new Date(2026,2,28,23,59,59);
beforeEach(()=>{jest.resetAllMocks();jest.mocked(api.readNativeProfile).mockResolvedValue({displayName:'Synthetic',avatarColourToken:null,avatarEmoji:null,language:'en',theme:'system',defaultCurrency:'SEK',profileComplete:true});jest.mocked(api.readNativeMode).mockResolvedValue({mode:'just-me'});});
it('selects exactly today through day29, not yesterday or day30, and only ACTIVE saved dates',()=>{
 const values=['2026-03-27','2026-03-28','2026-04-26','2026-04-27'].map((nextChargeDate,index)=>({...row,id:`123e4567-e89b-42d3-a456-42661417400${index}`,nextChargeDate}));
 const result=selectNativeRenewals([...values,{...row,id:'123e4567-e89b-42d3-a456-426614174010',nextChargeDate:null},{...row,id:'123e4567-e89b-42d3-a456-426614174011',status:'PAUSED'}],now());
 expect(result.map(g=>g.date)).toEqual(['2026-03-28','2026-04-26']);expect(result[0]?.items[0]?.expectedAmountMinor).toBe(row.expectedAmountMinor);
});
it('groups same-day rows, sorts dates then stable IDs and handles local midnight/leap/year boundaries',()=>{
 const other={...row,id:'123e4567-e89b-42d3-a456-426614174001'};const later={...row,id:'123e4567-e89b-42d3-a456-426614174002',nextChargeDate:'2026-03-29'};
 const result=selectNativeRenewals([later,other,row],now());expect(result[0]?.items.map(v=>v.id)).toEqual([row.id,other.id]);expect(result[1]?.date).toBe('2026-03-29');
 expect(selectNativeRenewals([row],new Date(2026,2,29,0,0,0))).toEqual([]);
 expect(selectNativeRenewals([{...row,nextChargeDate:'2024-02-29'}],new Date(2024,1,1))[0]?.date).toBe('2024-02-29');
 expect(selectNativeRenewals([{...row,nextChargeDate:'2027-01-01'}],new Date(2026,11,31))[0]?.date).toBe('2027-01-01');
 expect(selectNativeRenewals([{...row,nextChargeDate:'2026-11-22'},{...row,id:'123e4567-e89b-42d3-a456-426614174010',nextChargeDate:'2026-11-23'}],new Date(2026,9,24)).map(group=>group.date)).toEqual(['2026-11-22']);
 expect(renewalDateDay('0001-01-01')).toBeLessThan(renewalDateDay('0099-01-01'));expect(renewalDateDay('9999-12-31')).toBeGreaterThan(renewalDateDay('9999-01-01'));
});
it('rejects invalid local clock/dates, duplicate IDs and non-owner/mixed projections',()=>{
 for(const date of ['2026-02-29','2024-02-30','2026-13-01','2026-00-01','2026-01-00','0000-01-01','10000-01-01','2026-1-01','bad'])expect(()=>renewalDateDay(date)).toThrow();
 expect(()=>renewalDateDay(null as unknown as string)).toThrow();expect(()=>selectNativeRenewals([],new Date('bad'))).toThrow();expect(()=>selectNativeRenewals([],new Date(10000,0,1))).toThrow();expect(()=>selectNativeRenewals([],null as unknown as Date)).toThrow();
 const yearZero=new Date(0);yearZero.setFullYear(0);expect(()=>selectNativeRenewals([],yearZero)).toThrow();
 expect(()=>selectNativeRenewals([row,row],now())).toThrow();expect(()=>selectNativeRenewals([{...row,visibility:'household'} as unknown as typeof row],now())).toThrow();expect(()=>selectNativeRenewals([{...row,nextChargeDate:'0000-01-01'}],now())).toThrow();
});
it('does not read any owner page until complete current profile and Just me are known',async()=>{
 for(const gate of ['profile','mode']){if(gate==='profile')jest.mocked(api.readNativeProfile).mockResolvedValueOnce({displayName:null,avatarColourToken:null,avatarEmoji:null,language:'en',theme:'system',defaultCurrency:'SEK',profileComplete:false});else jest.mocked(api.readNativeMode).mockResolvedValueOnce({mode:null});
  expect(await readNativeRenewals('a.b.c',new AbortController().signal,now())).toEqual({kind:'setup-required'});expect(api.readNativeSubscriptions).not.toHaveBeenCalled();}
});
it('traverses to terminal cursor before selecting and rejects duplicate IDs/repeated cursors',async()=>{
 jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:[],nextCursor:'cursorA'}).mockResolvedValueOnce({items:[row],nextCursor:null});
 expect((await readNativeRenewals('a.b.c',new AbortController().signal,now())).kind).toBe('ready');expect(api.readNativeSubscriptions).toHaveBeenLastCalledWith('a.b.c',expect.any(AbortSignal),'cursorA');
 for(const defect of ['duplicate','cursor']){jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:[row],nextCursor:'cursorA'}).mockResolvedValueOnce({items:defect==='duplicate'?[row]:[],nextCursor:defect==='cursor'?'cursorA':null});await expect(readNativeRenewals('a.b.c',new AbortController().signal,now())).rejects.toThrow();}
});
it('aborted traversal never publishes partial private rows or continues another page',async()=>{
 const before=new AbortController();before.abort();await expect(readNativeRenewals('a.b.c',before.signal,now())).rejects.toThrow();expect(api.readNativeProfile).not.toHaveBeenCalled();
 const during=new AbortController();jest.mocked(api.readNativeSubscriptions).mockImplementationOnce(async()=>{during.abort();return {items:[row],nextCursor:'cursorA'};});await expect(readNativeRenewals('a.b.c',during.signal,now())).rejects.toThrow();expect(api.readNativeSubscriptions).toHaveBeenCalledTimes(1);
 const gated=new AbortController();jest.mocked(api.readNativeMode).mockImplementationOnce(async()=>{gated.abort();return {mode:'just-me'};});await expect(readNativeRenewals('a.b.c',gated.signal,now())).rejects.toThrow();expect(api.readNativeSubscriptions).toHaveBeenCalledTimes(1);
});
