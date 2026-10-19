import {createRequire} from 'node:module';
import type {PersonaHousehold} from '@subtrack/synthetic/personas-runtime';
import type {BankTransaction} from '@subtrack/domain/bank';

type SamplePlan=Readonly<{key:string;name:string;category:string;amountMinor:string;currency:'SEK';cadence:'MONTHLY'|'ANNUAL';billingDay:number;billingMonth:number;confirmed:boolean;sharedHousehold:boolean;sourceUrl:string;simulatedPriceChange?:Readonly<{from:string;previousAmountMinor:string}>}>;
/** Source anchors are dated; transactions and historical price changes are explicitly simulated. */
export const SWEDEN_SAMPLE=createRequire(__filename)('@subtrack/synthetic/sweden-subscriptions') as Readonly<{version:string;snapshotDate:string;synthetic:true;notice:string;plans:readonly SamplePlan[]}>;
export const PRODUCT_SEED_NAMESPACE=SWEDEN_SAMPLE.version;
export const PRODUCT_SEED_MERCHANTS=Object.freeze(SWEDEN_SAMPLE.plans.map(row=>Object.freeze({key:`${PRODUCT_SEED_NAMESPACE}-${row.key}`,canonicalName:row.name,category:row.category,aliases:[row.name]})));
export const PRODUCT_SEED_CONFIRMED=Object.freeze(SWEDEN_SAMPLE.plans.filter(row=>row.confirmed).map(row=>row.name));
// The existing provider port is a numeric minor-unit bridge. Refuse values outside its exact integer range.
function providerMinor(value:string){const minor=BigInt(value);if(minor<=0n||minor>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Sample amount unavailable');return Number(minor);}
export const PRODUCT_SEED_PERSONA:PersonaHousehold={id:PRODUCT_SEED_NAMESPACE,displayName:'Swedish household sample',seed:PRODUCT_SEED_NAMESPACE,members:[],subscriptions:SWEDEN_SAMPLE.plans.map(row=>({id:row.key,merchantId:row.key,merchantName:row.name,category:row.category,amountMinor:providerMinor(row.amountMinor),currency:'SEK',billingCadence:row.cadence,ownerType:'ME',descriptorVariants:[row.name,row.name,row.name],groundTruth:{isRecurring:true,normalizedAmountMinor:providerMinor(row.amountMinor)}}))};
export function productSeedTransactions(items:BankTransaction[],now:number):BankTransaction[]{const account=items[0]?.accountId;if(!account)throw new Error('Sample account unavailable');return productSeedTransactionsForAccount(account,now);}
/** Fixed calendar billing days and a fixed simulated epoch: overlapping booked IDs/amounts never drift on later Sync. */
export function productSeedTransactionsForAccount(accountId:string,now:number):BankTransaction[]{
 const today=new Date(now),year=today.getUTCFullYear(),month=today.getUTCMonth(),todayIso=today.toISOString().slice(0,10),result:BankTransaction[]=[];
 for(const plan of SWEDEN_SAMPLE.plans)for(let back=24;back>=0;back--){
  const first=new Date(Date.UTC(year,month-back,1)),y=first.getUTCFullYear(),m=first.getUTCMonth();if(plan.cadence==='ANNUAL'&&m+1!==plan.billingMonth)continue;
  const date=new Date(Date.UTC(y,m,Math.min(plan.billingDay,new Date(Date.UTC(y,m+1,0)).getUTCDate()))),stamp=date.toISOString().slice(0,10);if(stamp>todayIso)continue;
  const price=plan.simulatedPriceChange&&stamp<plan.simulatedPriceChange.from?plan.simulatedPriceChange.previousAmountMinor:plan.amountMinor;
  const id=`${PRODUCT_SEED_NAMESPACE}-${plan.key}-${stamp}`;result.push({id,externalId:id,accountId,date,description:plan.name,amountMinor:-providerMinor(price),currency:'SEK',direction:'DEBIT',pending:false});
 }
 return result;
}
