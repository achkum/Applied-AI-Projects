import type {PrivateOwnerSubscriptionView} from '../../../../packages/contracts/generated/types.gen';
import {parsePrivateOwnerView} from '@subtrack/contracts/private-onboarding';
import {readNativeProfile,readNativeMode,readNativeSubscriptions} from './privateMobileApi';
export type NativeRenewalGroup=Readonly<{date:string;items:readonly PrivateOwnerSubscriptionView[]}>;
const unavailable=()=>new Error('Private renewals unavailable');
function civilDay(year:number,month:number,day:number):number {
 const value=new Date(0);value.setUTCHours(0,0,0,0);value.setUTCFullYear(year,month-1,day);
 if(year<1||year>9999||`${value.getUTCFullYear()}-${value.getUTCMonth()+1}-${value.getUTCDate()}`!==`${year}-${month}-${day}`)throw unavailable();
 return value.getTime();
}
export function renewalDateDay(value:string):number {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw unavailable();
 return civilDay(Number(value.slice(0,4)),Number(value.slice(5,7)),Number(value.slice(8,10)));
}
export function selectNativeRenewals(rows:readonly PrivateOwnerSubscriptionView[],now:Date):readonly NativeRenewalGroup[] {
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw unavailable();
 const today=civilDay(now.getFullYear(),now.getMonth()+1,now.getDate());
 const last=today+29*86400000;const ids=new Set<string>();const selected:PrivateOwnerSubscriptionView[]=[];
 for(const input of rows){const row=parsePrivateOwnerView(input);if(ids.has(row.id))throw unavailable();ids.add(row.id);
  const date=row.nextChargeDate===null?null:renewalDateDay(row.nextChargeDate);
  if(row.status==='ACTIVE'&&date!==null&&date>=today&&date<=last)selected.push(row);
 }
 selected.sort((a,b)=>a.nextChargeDate!.localeCompare(b.nextChargeDate!)||a.id.localeCompare(b.id));
 const groups: {date:string;items:PrivateOwnerSubscriptionView[]}[]=[];
 for(const item of selected){const last=groups[groups.length-1];if(last?.date===item.nextChargeDate)last.items.push(item);else groups.push({date:item.nextChargeDate!,items:[item]});}
 return groups;
}
export async function readNativeRenewals(token:string,signal:AbortSignal,now:Date):Promise<Readonly<{kind:'ready';groups:readonly NativeRenewalGroup[]}|{kind:'setup-required'}>> {
 if(signal.aborted)throw unavailable();
 const profile=await readNativeProfile(token,signal);const mode=await readNativeMode(token,signal);
 if(!profile.profileComplete||mode.mode!=='just-me')return {kind:'setup-required'};
 const rows:PrivateOwnerSubscriptionView[]=[];const ids=new Set<string>();const cursors=new Set<string>();let cursor:string|undefined;
 for(;;){if(signal.aborted)throw unavailable();const page=await readNativeSubscriptions(token,signal,cursor);
  if(signal.aborted)throw unavailable();
  for(const row of page.items){if(ids.has(row.id))throw unavailable();ids.add(row.id);rows.push(row);}
  if(page.nextCursor===null)break;
  if(cursors.has(page.nextCursor))throw unavailable();cursors.add(page.nextCursor);cursor=page.nextCursor;
 }
 return {kind:'ready',groups:selectNativeRenewals(rows,now)};
}
