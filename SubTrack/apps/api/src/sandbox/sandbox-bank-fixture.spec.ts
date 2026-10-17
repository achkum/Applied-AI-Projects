import {describe,it,expect} from 'vitest';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {SANDBOX_BANK_PERSONA,SANDBOX_DETECTION_MERCHANTS,sandboxBankTransactions} from './sandbox-bank-fixture.js';
const runtime=createRequire(__filename);
describe('synthetic showcase inputs exercise the accepted ingestion and detector',()=>{
 it('generates broad replay-stable histories, real recurring candidates and excluded pending/refund/nonmerchant rows',async()=>{
  const {SyntheticBankProvider}=await import(pathToFileURL(runtime.resolve('@subtrack/synthetic/bank-runtime')).href) as typeof import('@subtrack/synthetic/bank-runtime');
  const domain=await import(pathToFileURL(runtime.resolve('@subtrack/domain/detection-runtime')).href) as typeof import('@subtrack/domain/detection-runtime');
  const provider=new SyntheticBankProvider([SANDBOX_BANK_PERSONA]),[account]=await provider.getAccounts('showcase');
  const until=new Date('2026-10-17T12:00:00.000Z'),from=new Date('2024-10-17T12:00:00.000Z');
  const original=await provider.getTransactions(account!.id,from,until),items=sandboxBankTransactions(original,until.getTime());
  expect(items.length).toBeGreaterThan(250);expect(sandboxBankTransactions(await provider.getTransactions(account!.id,from,until),until.getTime())).toEqual(items);
  expect(new Set(items.map(x=>x.externalId)).size).toBe(items.length);
  expect(items.some(x=>x.pending)).toBe(true);expect(items.some(x=>x.direction==='CREDIT')).toBe(true);
  const candidates=[];
  for(const merchant of SANDBOX_DETECTION_MERCHANTS){
   const matching=items.filter(row=>domain.matchMerchantDescriptor(row.description,SANDBOX_DETECTION_MERCHANTS)?.key===merchant.key);
   const detected=domain.detectRecurringBigint({ownerId:'showcase',accountId:account!.id,merchantKey:merchant.key,currency:'SEK',categoryCode:merchant.category,
    transactions:matching.map(row=>({...row,amountMinor:BigInt(row.amountMinor)}))});
   expect(detected.some(x=>x.cadence===(merchant.key==='focus-suite'?'ANNUAL':'MONTHLY'))).toBe(true);candidates.push(...detected);
  }
  expect(new Set(candidates.map(x=>x.merchantKey)).size).toBe(12);
  const sourceIds=new Set(candidates.flatMap(x=>x.transactionIds));
  for(const row of items.filter(x=>x.pending||x.direction==='CREDIT'||/GROCERY|ONE OFF/.test(x.description)))expect(sourceIds.has(row.id)).toBe(false);
  const recent=items.filter(x=>/aurora video/i.test(x.description)&&x.direction==='DEBIT'&&x.date>=new Date('2026-08-01'));
  expect(recent.length).toBeGreaterThanOrEqual(2);expect(recent.every(x=>x.amountMinor===-15900)).toBe(true);
 });
});


it('keeps the fictional August price epoch and overlapping booked grocery history stable across later sync months',()=>{
 const input=['2026-07-31','2026-08-01','2026-09-01','2026-10-01'].map((stamp,index)=>({id:`aurora-${stamp}`,externalId:`aurora-${stamp}`,accountId:'showcase-account',date:new Date(`${stamp}T00:00:00.000Z`),description:index%2?'AURORA VIDEO AB':'Aurora Video',amountMinor:-14900,currency:'SEK',direction:'DEBIT' as const,pending:false}));
 const original=sandboxBankTransactions(input,Date.parse('2026-10-17T12:00:00.000Z'));
 expect(original.slice(0,input.length).map(row=>row.amountMinor)).toEqual([-14900,-15900,-15900,-15900]);
 for(const now of ['2026-11-17T12:00:00.000Z','2027-01-17T12:00:00.000Z','2027-10-17T12:00:00.000Z']){
  const later=sandboxBankTransactions(input,Date.parse(now));
  expect(later.slice(0,input.length)).toEqual(original.slice(0,input.length));
  const originalGroceries=new Map(original.filter(row=>row.description==='CORNER GROCERY').map(row=>[row.externalId,row]));
  for(const row of later.filter(row=>originalGroceries.has(row.externalId)))expect(row).toEqual(originalGroceries.get(row.externalId));
  expect(later.filter(row=>row.description==='CORNER GROCERY').every(row=>row.amountMinor<0&&row.direction==='DEBIT'&&!row.pending)).toBe(true);
 }
 expect(original.find(row=>row.externalId==='showcase-grocery-2026-10-08')?.amountMinor).toBe(-4500);
 expect(original.find(row=>row.externalId==='showcase-grocery-2026-09-08')?.amountMinor).toBe(-5213);
 expect(original.find(row=>row.externalId==='showcase-refund-2026-10-12')?.amountMinor).toBe(14900);
 expect(original.find(row=>row.externalId==='showcase-pending-2026-10-12')?.pending).toBe(true);
 expect(original.find(row=>row.externalId==='showcase-oneoff-2026-10-12')?.amountMinor).toBe(-169900);
 expect(SANDBOX_BANK_PERSONA.seed).toBe('showcase-v2');
});


it('preserves incoming Aurora credits, refunds and pending records across the fictional price epoch',()=>{
 const common={accountId:'showcase-account',date:new Date('2026-09-01T00:00:00.000Z'),currency:'SEK',pending:false};
 const input=[
  {...common,id:'refund',externalId:'refund',description:'AURORA VIDEO REFUND',amountMinor:14900,direction:'CREDIT' as const},
  {...common,id:'pending',externalId:'pending',description:'AURORA VIDEO',amountMinor:-14900,direction:'DEBIT' as const,pending:true},
  {...common,id:'positive',externalId:'positive',description:'Aurora Video',amountMinor:14900,direction:'DEBIT' as const},
 ];
 expect(sandboxBankTransactions(input,Date.parse('2026-10-17T12:00:00.000Z')).slice(0,input.length)).toEqual(input);
});
