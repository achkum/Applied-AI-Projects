import {describe,it,expect} from 'vitest';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import type {BankTransaction} from '@subtrack/domain/bank';
import {productSeedTransactions,PRODUCT_SEED_NAMESPACE,PRODUCT_SEED_MERCHANTS,PRODUCT_SEED_CONFIRMED,SWEDEN_SAMPLE} from './sandbox-product-seed-fixture.js';
const runtime=createRequire(__filename),account={accountId:'sample-account',id:'original',externalId:'original',date:new Date('2026-01-01'),description:'untouched',amountMinor:-1,currency:'SEK',direction:'DEBIT',pending:false} as BankTransaction;
describe('Swedish synthetic owner portfolio',()=>{
 it('provides recognizable dated anchors and 24 months of actual recurring sample transactions with no future booked charges',async()=>{
  const domain=await import(pathToFileURL(runtime.resolve('@subtrack/domain/detection-runtime')).href) as typeof import('@subtrack/domain/detection-runtime');
  for(const stamp of ['2026-10-17T12:00:00Z','2026-10-31T12:00:00Z','2028-02-29T12:00:00Z']){
   const now=Date.parse(stamp),items=productSeedTransactions([account],now);expect(productSeedTransactions([account],now)).toEqual(items);expect(items.length).toBeGreaterThan(330);expect(new Set(items.map(row=>row.externalId)).size).toBe(items.length);expect(items.every(row=>row.externalId.startsWith(PRODUCT_SEED_NAMESPACE)&&row.date.toISOString().slice(0,10)<=stamp.slice(0,10)&&row.amountMinor<0&&row.direction==='DEBIT'&&!row.pending)).toBe(true);
   const cadences=new Set<string>();for(const merchant of PRODUCT_SEED_MERCHANTS){const transactions=items.filter(row=>row.description===merchant.canonicalName).map(row=>({...row,amountMinor:BigInt(row.amountMinor)})),found=domain.detectRecurringBigint({ownerId:'owner',accountId:account.accountId,merchantKey:merchant.key,currency:'SEK',categoryCode:merchant.category,transactions});expect(found.length).toBeGreaterThan(0);for(const row of found)cadences.add(row.cadence);if(merchant.canonicalName==='Spotify Premium Family'){const current=transactions.find(row=>row.date.toISOString().slice(0,7)===stamp.slice(0,7));expect(current).toBeDefined();expect(current!.date.getTime()).toBeLessThanOrEqual(now);expect(found.some(row=>row.transactionIds.includes(current!.id))).toBe(true);expect(PRODUCT_SEED_CONFIRMED).toContain(merchant.canonicalName);}}
   expect([...cadences]).toEqual(expect.arrayContaining(['MONTHLY','ANNUAL']));
  }
  expect(PRODUCT_SEED_CONFIRMED).toHaveLength(12);expect(PRODUCT_SEED_MERCHANTS).toHaveLength(16);expect(SWEDEN_SAMPLE.synthetic).toBe(true);expect(SWEDEN_SAMPLE.snapshotDate).toBe('2026-10-18');expect(SWEDEN_SAMPLE.notice).toMatch(/simulated/);expect(SWEDEN_SAMPLE.plans.every(row=>row.sourceUrl.startsWith('https://')&&/^[1-9][0-9]*$/.test(row.amountMinor))).toBe(true);expect(account.description).toBe('untouched');expect(()=>productSeedTransactions([],Date.now())).toThrow();
 });
 it('uses a fixed explicitly simulated Netflix price epoch and immutable overlapping booked IDs across later syncs',()=>{
  const initial=productSeedTransactions([account],Date.parse('2026-10-17T12:00:00Z')),last=initial.filter(row=>row.description==='Netflix').slice(-5);expect(last.map(row=>row.amountMinor)).toEqual([-11900,-11900,-11900,-12900,-12900]);const byId=new Map(initial.map(row=>[row.externalId,row]));for(const when of ['2026-11-17','2027-01-17','2027-10-17'])for(const row of productSeedTransactions([account],Date.parse(`${when}T12:00:00Z`)))if(byId.has(row.externalId))expect(row).toEqual(byId.get(row.externalId));
 });
});
