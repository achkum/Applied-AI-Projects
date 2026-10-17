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
