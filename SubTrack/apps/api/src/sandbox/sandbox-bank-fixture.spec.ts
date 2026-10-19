import {describe,it,expect} from 'vitest';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {SANDBOX_BANK_PERSONA,SANDBOX_DETECTION_MERCHANTS,SANDBOX_BANK_FIXTURE_VERSION,sandboxBankTransactions} from './sandbox-bank-fixture.js';
import {productSeedTransactionsForAccount} from './sandbox-product-seed-fixture.js';
const runtime=createRequire(__filename);
describe('Swedish sandbox bank input',()=>{
 it('uses the same namespaced sample plans as initialization and excludes actual refund/pending/one-off controls from detection',async()=>{
  const {SyntheticBankProvider}=await import(pathToFileURL(runtime.resolve('@subtrack/synthetic/bank-runtime')).href) as typeof import('@subtrack/synthetic/bank-runtime'),domain=await import(pathToFileURL(runtime.resolve('@subtrack/domain/detection-runtime')).href) as typeof import('@subtrack/domain/detection-runtime');
  const provider=new SyntheticBankProvider([SANDBOX_BANK_PERSONA]),[account]=await provider.getAccounts('showcase'),until=new Date('2026-10-17T12:00:00Z'),from=new Date('2024-10-17T12:00:00Z'),original=await provider.getTransactions(account!.id,from,until),snapshot=structuredClone(original),items=sandboxBankTransactions(original,until.getTime());
  expect(original).toEqual(snapshot);expect(items.length).toBeGreaterThan(350);expect(sandboxBankTransactions(original,until.getTime())).toEqual(items);expect(new Set(items.map(row=>row.externalId)).size).toBe(items.length);const expected=productSeedTransactionsForAccount(account!.id,until.getTime());for(const row of expected)expect(items.find(item=>item.externalId===row.externalId)).toEqual(row);
  const candidates=[];for(const merchant of SANDBOX_DETECTION_MERCHANTS){const matching=items.filter(row=>domain.matchMerchantDescriptor(row.description,SANDBOX_DETECTION_MERCHANTS)?.key===merchant.key),detected=domain.detectRecurringBigint({ownerId:'showcase',accountId:account!.id,merchantKey:merchant.key,currency:'SEK',categoryCode:merchant.category,transactions:matching.map(row=>({...row,amountMinor:BigInt(row.amountMinor)}))});expect(detected.length).toBeGreaterThan(0);candidates.push(...detected);}
  expect(new Set(candidates.map(row=>row.merchantKey)).size).toBe(16);const sourceIds=new Set(candidates.flatMap(row=>row.transactionIds));for(const row of items.filter(row=>row.pending||row.direction==='CREDIT'||/ICA|Swish|Apotek/.test(row.description)))expect(sourceIds.has(row.id)).toBe(false);expect(items.some(row=>row.pending)).toBe(true);expect(items.some(row=>row.direction==='CREDIT')).toBe(true);expect(SANDBOX_BANK_FIXTURE_VERSION).toBe('showcase-v2');
 });
 it('keeps overlapping booked transactions and negative controls stable without reusing or rewriting fictional cohort IDs',()=>{
  const input=[{id:'old-aurora',externalId:'old-aurora',accountId:'sample-account',date:new Date('2026-09-01'),description:'Aurora Video',amountMinor:-15900,currency:'SEK',direction:'DEBIT' as const,pending:false}],now=Date.parse('2026-10-17T12:00:00Z'),initial=sandboxBankTransactions(input,now),byId=new Map(initial.filter(row=>!row.pending).map(row=>[row.externalId,row]));for(const when of ['2026-11-17','2027-01-17','2027-10-17'])for(const row of sandboxBankTransactions(input,Date.parse(`${when}T12:00:00Z`)))if(byId.has(row.externalId))expect(row).toEqual(byId.get(row.externalId));expect(initial.some(row=>row.externalId==='old-aurora')).toBe(false);expect(input[0]!.amountMinor).toBe(-15900);expect(sandboxBankTransactions([],now)).toEqual([]);
 });
});
