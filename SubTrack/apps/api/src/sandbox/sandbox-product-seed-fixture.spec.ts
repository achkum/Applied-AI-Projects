import {describe,it,expect} from 'vitest';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import type {BankTransaction} from '@subtrack/domain/bank';
import {productSeedTransactions,PRODUCT_SEED_MERCHANTS,PRODUCT_SEED_CONFIRMED} from './sandbox-product-seed-fixture.js';
const runtime=createRequire(__filename);
const account={accountId:'sample-account',id:'original',externalId:'original',date:new Date('2026-01-01'),description:'untouched',amountMinor:-1,currency:'SEK',direction:'DEBIT',pending:false} as BankTransaction;
describe('owner sample history',()=>{
 it('provides replay-stable distinct booked streams with a current recurrence, broad cadences and a real price increase',async()=>{
  const domain=await import(pathToFileURL(runtime.resolve('@subtrack/domain/detection-runtime')).href) as typeof import('@subtrack/domain/detection-runtime');
  for(const stamp of ['2026-10-17T12:00:00Z','2026-10-31T12:00:00Z','2028-02-29T12:00:00Z']){
   const now=Date.parse(stamp),items=productSeedTransactions([account],now);expect(productSeedTransactions([account],now)).toEqual(items);expect(items.length).toBeGreaterThan(240);expect(new Set(items.map(row=>row.externalId)).size).toBe(items.length);expect(items.every(row=>row.externalId.startsWith('product-seed-v1-')&&row.date.toISOString().slice(0,10)<=stamp.slice(0,10)&&row.amountMinor<0&&row.direction==='DEBIT'&&!row.pending)).toBe(true);
   const cadences=new Set<string>();
   for(const merchant of PRODUCT_SEED_MERCHANTS){const transactions=items.filter(row=>row.description===merchant.canonicalName).map(row=>({...row,amountMinor:BigInt(row.amountMinor)}));const found=domain.detectRecurringBigint({ownerId:'owner',accountId:account.accountId,merchantKey:merchant.key,currency:'SEK',categoryCode:merchant.category,transactions});expect(found.length).toBeGreaterThan(0);if(merchant.canonicalName==='Lumen Music'){const current=transactions.find(row=>row.date.toISOString().slice(0,7)===stamp.slice(0,7));expect(current).toBeDefined();expect(current!.date.getTime()).toBeLessThanOrEqual(now);expect(current!.amountMinor).toBeLessThan(0n);expect(found.some(row=>row.transactionIds.includes(current!.id))).toBe(true);expect(PRODUCT_SEED_CONFIRMED).toContain(merchant.canonicalName);}for(const row of found)cadences.add(row.cadence);}
   expect([...cadences]).toEqual(expect.arrayContaining(['MONTHLY','ANNUAL','QUARTERLY']));
   const last=items.filter(row=>row.description==='Cedar Video').slice(-5);expect(last.slice(-2).map(row=>row.amountMinor)).toEqual([-15900,-15900]);expect(last.slice(0,3).map(row=>row.amountMinor)).toEqual([-14900,-14900,-14900]);
  }
  expect(PRODUCT_SEED_CONFIRMED).toHaveLength(8);expect(PRODUCT_SEED_MERCHANTS).toHaveLength(12);expect(account.description).toBe('untouched');expect(()=>productSeedTransactions([],Date.now())).toThrow();
 });
});
