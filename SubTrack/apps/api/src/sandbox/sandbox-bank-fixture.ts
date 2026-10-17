import type {PersonaHousehold} from '@subtrack/synthetic/personas-runtime';
import type {BankTransaction} from '@subtrack/domain/bank';

/** Fictional provider data, not catalogue/market prices. Never seeded as subscriptions. */
export const SANDBOX_BANK_FIXTURE_VERSION='showcase-v2';
const streams=Object.freeze([
 ['aurora-video','Aurora Video','VIDEO_STREAMING',14900,'MONTHLY'],
 ['cinema-plus','Cinema Plus','VIDEO_STREAMING',9900,'MONTHLY'],
 ['soundwave','Soundwave','MUSIC_AUDIO',10900,'MONTHLY'],
 ['readly-books','Readly Books','AUDIOBOOKS_EBOOKS',17900,'MONTHLY'],
 ['daily-press','Daily Press','NEWS_MAGAZINES',7900,'MONTHLY'],
 ['pixel-play','Pixel Play','GAMING',12900,'MONTHLY'],
 ['focus-suite','Focus Suite','SOFTWARE_PRODUCTIVITY',89900,'ANNUAL'],
 ['cloud-vault','Cloud Vault','CLOUD_STORAGE',3900,'MONTHLY'],
 ['nova-ai','Nova AI','AI_TOOLS',22900,'MONTHLY'],
 ['mobile-one','Mobile One','MOBILE_PLAN',24900,'MONTHLY'],
 ['home-connect','Home Connect','BROADBAND_TV',39900,'MONTHLY'],
 ['move-club','Move Club','FITNESS_WELLNESS',29900,'MONTHLY'],
] as const);
export const SANDBOX_DETECTION_MERCHANTS=Object.freeze(streams.map(([key,canonicalName,category])=>Object.freeze({
 key,canonicalName,category,aliases:[canonicalName,canonicalName.toUpperCase(),`${canonicalName.toUpperCase()} AB`],
})));
export const SANDBOX_BANK_PERSONA:PersonaHousehold={id:'showcase',displayName:'Synthetic bank',seed:'showcase-v2',members:[],
 subscriptions:streams.map(([key,name,category,amountMinor,cadence])=>({id:key,merchantId:key,merchantName:name,category,
 amountMinor,currency:'SEK',billingCadence:cadence,ownerType:'ME',descriptorVariants:[name,name.toUpperCase(),`${name.toUpperCase()} AB`],
 groundTruth:{isRecurring:true,normalizedAmountMinor:amountMinor}})),
};
/** Stable transaction ids survive repeated sync. Includes true negatives and an evidenced price change. */
export function sandboxBankTransactions(items:BankTransaction[],now:number):BankTransaction[]{
 // Fixed fictional price-change epoch: later syncs must not rewrite a booked charge.
 const boundary=new Date('2026-08-01T00:00:00.000Z');
 const mapped=items.map(item=>item.direction==='DEBIT'&&item.amountMinor<0&&!item.pending&&/aurora video/i.test(item.description)&&item.date>=boundary?
  {...item,amountMinor:-15900}:item);
 const account=items[0]?.accountId;if(!account)return mapped;
 const month=new Date(now);month.setUTCDate(1);month.setUTCHours(0,0,0,0);
 for(let index=0;index<12;index++){
  const date=new Date(month);date.setUTCMonth(date.getUTCMonth()-index);date.setUTCDate(8);
  if(date.getTime()>now)continue;
  const stamp=date.toISOString().slice(0,10);
  // Preserve the October2026 sample amounts while binding variation to the booked month.
  const amountIndex=((2026*12+9-(date.getUTCFullYear()*12+date.getUTCMonth()))%12+12)%12;
  mapped.push({id:`showcase-grocery-${stamp}`,externalId:`showcase-grocery-${stamp}`,accountId:account,date,
   description:'CORNER GROCERY',amountMinor:-(4500+amountIndex*713),currency:'SEK',direction:'DEBIT',pending:false});
 }
 const date=new Date(month);date.setUTCDate(Math.min(12,new Date(now).getUTCDate()));const stamp=date.toISOString().slice(0,10);
 mapped.push({id:`showcase-refund-${stamp}`,externalId:`showcase-refund-${stamp}`,accountId:account,date,
  description:'AURORA VIDEO REFUND',amountMinor:14900,currency:'SEK',direction:'CREDIT',pending:false});
 mapped.push({id:`showcase-pending-${stamp}`,externalId:`showcase-pending-${stamp}`,accountId:account,date,
  description:'CINEMA PLUS',amountMinor:-9900,currency:'SEK',direction:'DEBIT',pending:true});
 mapped.push({id:`showcase-oneoff-${stamp}`,externalId:`showcase-oneoff-${stamp}`,accountId:account,date,
  description:'ONE OFF HARDWARE',amountMinor:-169900,currency:'SEK',direction:'DEBIT',pending:false});
 return mapped;
}
