import type {BankTransaction} from '@subtrack/domain/bank';
import {PRODUCT_SEED_NAMESPACE,PRODUCT_SEED_PERSONA,PRODUCT_SEED_MERCHANTS,productSeedTransactionsForAccount} from './sandbox-product-seed-fixture.js';
/** Retained DB generation version; dataset cohorts have independent stable namespaced IDs. */
export const SANDBOX_BANK_FIXTURE_VERSION='showcase-v2';
export const SANDBOX_BANK_PERSONA={...PRODUCT_SEED_PERSONA,id:'showcase'};
export const SANDBOX_DETECTION_MERCHANTS=PRODUCT_SEED_MERCHANTS;
/** Normal Sync and one-time initialization ingest the exact same portfolio, never two duplicate sample sets. */
export function sandboxBankTransactions(items:BankTransaction[],now:number):BankTransaction[]{
 const account=items[0]?.accountId;return account?sandboxBankTransactionsForAccount(account,now):[];
}
export function sandboxBankTransactionsForAccount(account:string,now:number):BankTransaction[]{
 const result=productSeedTransactionsForAccount(account,now),today=new Date(now),month=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),1));
 for(let back=0;back<24;back++){
  const date=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()-back,8));if(date.getTime()>now)continue;const stamp=date.toISOString().slice(0,10),variation=(date.getUTCFullYear()*12+date.getUTCMonth())%7;
  result.push({id:`${PRODUCT_SEED_NAMESPACE}-ica-${stamp}`,externalId:`${PRODUCT_SEED_NAMESPACE}-ica-${stamp}`,accountId:account,date,description:'ICA KVANTUM',amountMinor:-(84327+variation*743),currency:'SEK',direction:'DEBIT',pending:false});
 }
 const date=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),Math.min(12,today.getUTCDate()))),stamp=date.toISOString().slice(0,10);
 for(const [key,description,amountMinor,direction,pending]of [
  ['refund','Netflix refund',12900,'CREDIT',false],['pending','Disney+ Premium',-15900,'DEBIT',true],['swish','Swish dinner',-32500,'DEBIT',false],['pharmacy','Apotek Hjärtat',-24750,'DEBIT',false],
 ] as const){const id=`${PRODUCT_SEED_NAMESPACE}-${key}-${stamp}`;result.push({id,externalId:id,accountId:account,date,description,amountMinor,currency:'SEK',direction,pending});}
 return result;
}
