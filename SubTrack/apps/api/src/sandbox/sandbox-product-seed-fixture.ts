import type {PersonaHousehold} from '@subtrack/synthetic/personas-runtime';
import type {BankTransaction} from '@subtrack/domain/bank';

/** Independent fictional streams: never collide with an existing bank import or review. */
export const PRODUCT_SEED_NAMESPACE='product-seed-v1';
const streams=[
 ['cedar-video','Cedar Video','VIDEO_STREAMING',14900,'MONTHLY'],
 ['birch-cinema','Birch Cinema','VIDEO_STREAMING',9900,'MONTHLY'],
 ['lumen-music','Lumen Music','MUSIC_AUDIO',10900,'MONTHLY'],
 ['papertrail-books','Papertrail Books','AUDIOBOOKS_EBOOKS',17900,'MONTHLY'],
 ['morning-post','Morning Post','NEWS_MAGAZINES',7900,'MONTHLY'],
 ['playbox','Playbox','GAMING',12900,'MONTHLY'],
 ['studio-office','Studio Office','SOFTWARE_PRODUCTIVITY',89900,'ANNUAL'],
 ['nimbus-drive','Nimbus Drive','CLOUD_STORAGE',3900,'MONTHLY'],
 ['atlas-ai','Atlas AI','AI_TOOLS',22900,'MONTHLY'],
 ['evergreen-mobile','Evergreen Mobile','MOBILE_PLAN',24900,'MONTHLY'],
 ['meadow-broadband','Meadow Broadband','BROADBAND_TV',39900,'QUARTERLY'],
 ['motion-club','Motion Club','FITNESS_WELLNESS',29900,'MONTHLY'],
] as const;
export const PRODUCT_SEED_MERCHANTS=Object.freeze(streams.map(([key,canonicalName,category])=>Object.freeze({key:`${PRODUCT_SEED_NAMESPACE}-${key}`,canonicalName,category,aliases:[canonicalName]})));
export const PRODUCT_SEED_CONFIRMED=Object.freeze(streams.slice(0,8).map(([,name])=>name));
// The legacy provider supplies account identity; the transform below supplies actual quarterly booked dates.
export const PRODUCT_SEED_PERSONA:PersonaHousehold={id:PRODUCT_SEED_NAMESPACE,displayName:'Fictional sample bank',seed:PRODUCT_SEED_NAMESPACE,members:[],subscriptions:streams.map(([id,name,category,amountMinor,cadence])=>({id,merchantId:id,merchantName:name,category,amountMinor,currency:'SEK',billingCadence:cadence==='ANNUAL'?'ANNUAL':'MONTHLY',ownerType:'ME',descriptorVariants:[name,name,name],groundTruth:{isRecurring:true,normalizedAmountMinor:amountMinor}}))};
/** Fictional booked dates never exceed today; most streams retain an upcoming renewal, with Lumen booked this month. */
export function productSeedTransactions(items:BankTransaction[],now:number):BankTransaction[]{
 const accountId=items[0]?.accountId;if(!accountId)throw new Error('Sample account unavailable');return productSeedTransactionsForAccount(accountId,now);
}
export function productSeedTransactionsForAccount(accountId:string,now:number):BankTransaction[]{
 const today=new Date(now),year=today.getUTCFullYear(),month=today.getUTCMonth(),day=Math.min(today.getUTCDate()+2,new Date(Date.UTC(year,month+1,0)).getUTCDate());
 const todayIso=today.toISOString().slice(0,10),result:BankTransaction[]=[];
 for(const [key,name,,base,cadence]of streams)for(let back=24;back>=0;back--){
  if(cadence==='ANNUAL'&&back%12!==0||cadence==='QUARTERLY'&&back%3!==0)continue;
  const first=new Date(Date.UTC(year,month-back,1)),last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
  const bookedCurrent=key==='lumen-music',billingDay=bookedCurrent?Math.max(1,today.getUTCDate()-2):day;
  const date=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),Math.min(billingDay,last))),stamp=date.toISOString().slice(0,10);if(stamp>todayIso||stamp===todayIso&&!bookedCurrent)continue;
  const raised=key==='cedar-video'&&back<=2,amount=base+(raised?1000:0),id=`${PRODUCT_SEED_NAMESPACE}-${key}-${stamp}`;
  result.push({id,externalId:id,accountId,date,description:name,amountMinor:-amount,currency:'SEK',direction:'DEBIT',pending:false});
 }
 return result;
}
