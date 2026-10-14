import type {PrivateOwnerSubscriptionView} from '../../../../packages/contracts/generated/types.gen';
import {parsePrivateOwnerView} from '@subtrack/contracts/private-onboarding';
import {money,add,type Money} from '../../../../packages/money/src/money';
import {renewalDateDay} from './privateMobileRenewals';
import {readNativeProfile,readNativeMode,readNativeSubscriptions} from './privateMobileApi';
export type BillingMonth=Readonly<{year:number;month:number}>;
export type BillingDay=Readonly<{date:string;items:readonly PrivateOwnerSubscriptionView[]}>;
export type BillingProjection=Readonly<{month:BillingMonth;days:readonly BillingDay[];totals:readonly Money[]}>;
const fail=()=>new Error('Private billing month unavailable');
export function checkBillingMonth(month:BillingMonth):BillingMonth{
 if(!month||!Number.isInteger(month.year)||month.year<1||month.year>9999||!Number.isInteger(month.month)||month.month<1||month.month>12)throw fail();return month;
}
export function currentBillingMonth(now:Date):BillingMonth{if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw fail();return checkBillingMonth({year:now.getFullYear(),month:now.getMonth()+1});}
export function shiftBillingMonth(input:BillingMonth,direction:-1|1):BillingMonth{
 const month=checkBillingMonth(input);if(direction!==-1&&direction!==1)throw fail();
 const value=new Date(0);value.setUTCFullYear(month.year,month.month-1+direction,1);return checkBillingMonth({year:value.getUTCFullYear(),month:value.getUTCMonth()+1});
}
export function selectBillingMonth(rows:readonly PrivateOwnerSubscriptionView[],input:BillingMonth):BillingProjection{
 const month=checkBillingMonth(input),prefix=`${String(month.year).padStart(4,'0')}-${String(month.month).padStart(2,'0')}-`;
 const ids=new Set<string>(),selected:PrivateOwnerSubscriptionView[]=[];
 for(const input of rows){const row=parsePrivateOwnerView(input);if(ids.has(row.id))throw fail();ids.add(row.id);
  if(row.nextChargeDate!==null)renewalDateDay(row.nextChargeDate);
  if(row.status==='ACTIVE'&&row.nextChargeDate!==null&&row.nextChargeDate.startsWith(prefix))selected.push(row);
 }
 selected.sort((a,b)=>a.nextChargeDate!.localeCompare(b.nextChargeDate!)||a.id.localeCompare(b.id));
 const days:{date:string;items:PrivateOwnerSubscriptionView[]}[]=[],totals=new Map<string,Money>();
 for(const item of selected){const last=days[days.length-1];if(last?.date===item.nextChargeDate)last.items.push(item);else days.push({date:item.nextChargeDate!,items:[item]});
  const value=money(BigInt(item.expectedAmountMinor),item.currency);totals.set(item.currency,add(totals.get(item.currency)??money(0n,item.currency),value));
 }
 return {month,days,totals:[...totals.values()].sort((a,b)=>a.currency.localeCompare(b.currency))};
}
export async function readBillingMonth(token:string,signal:AbortSignal,month:BillingMonth):Promise<Readonly<{kind:'ready';projection:BillingProjection}|{kind:'setup-required'}>>{
 checkBillingMonth(month);if(signal.aborted)throw fail();const profile=await readNativeProfile(token,signal),mode=await readNativeMode(token,signal);if(!profile.profileComplete||mode.mode!=='just-me')return {kind:'setup-required'};
 const rows:PrivateOwnerSubscriptionView[]=[],ids=new Set<string>(),cursors=new Set<string>();let cursor:string|undefined;
 for(;;){if(signal.aborted)throw fail();const page=await readNativeSubscriptions(token,signal,cursor);if(signal.aborted)throw fail();
  for(const row of page.items){if(ids.has(row.id))throw fail();ids.add(row.id);rows.push(row);}
  if(page.nextCursor===null)break;if(cursors.has(page.nextCursor))throw fail();cursors.add(page.nextCursor);cursor=page.nextCursor;
 }
 return {kind:'ready',projection:selectBillingMonth(rows,month)};
}
