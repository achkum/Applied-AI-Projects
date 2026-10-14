import {PRIVATE_MOBILE_LIFECYCLE_STATEMENTS,executeMobileEdit,executeMobileStatus,type MobileLifecycleResult} from '../subscriptions/private-mobile-lifecycle.js';
import {createRequire} from 'node:module';
import {createHash,timingSafeEqual} from 'node:crypto';
import type {OwnerTx} from '../auth/sessions-v2/durable-current-web-authority.js';
import type {DurablePrivateMobileAuthority} from '../auth/mobile-private/durable-mobile-authority.js';
import {PRIVATE_PROFILE_STATEMENTS} from './private-profile-statements.js';
import {PRIVATE_ONBOARDING_STATEMENTS} from './private-onboarding-statements.js';
import {PRIVATE_MANUAL_CREATE_STATEMENTS} from '../subscriptions/private-manual-create-statements.js';
import {parsePrivateMobileCursor,encodePrivateMobileCursor} from './private-mobile-cursor.js';
const contracts=createRequire(__filename);
const {parsePrivateMobileManualEdit,parsePrivateMobileStatus}=contracts('@subtrack/contracts/private-mobile') as {parsePrivateMobileManualEdit(v:unknown):Record<string,unknown>;parsePrivateMobileStatus(v:unknown):Record<string,unknown>};
const {parseProfilePatch,parseProfileView,parseJustMeChoice}=contracts('@subtrack/contracts/profile') as {
 parseProfilePatch(v:unknown):Record<string,unknown>;parseProfileView(v:unknown):object;parseJustMeChoice(v:unknown):object;
};
const {parseModeView,parsePrivateOwnerPageRequest,parsePrivateOwnerView,parsePrivateOwnerPage,parsePrivateManualCreate,parsePrivateManualCreated}=contracts('@subtrack/contracts/private-onboarding') as {
 parseModeView(v:unknown):object;parsePrivateOwnerPageRequest(v:unknown):{cursor?:string};parsePrivateOwnerView(v:unknown):object;parsePrivateOwnerPage(v:unknown):object;
 parsePrivateManualCreate(v:unknown):{customName:string;categoryCode:string;cadence:string;expectedAmountMinor:string;nextChargeDate:string|null};parsePrivateManualCreated(v:unknown):{id:string};
};
export const PRIVATE_MOBILE_BUSINESS_STATEMENTS=Object.freeze({...PRIVATE_PROFILE_STATEMENTS,...PRIVATE_ONBOARDING_STATEMENTS,...PRIVATE_MANUAL_CREATE_STATEMENTS,...PRIVATE_MOBILE_LIFECYCLE_STATEMENTS});
export type PrivateMobileBusinessOperation='profile-read'|'profile'|'mode-read'|'mode'|'owner-read'|'manual'|'manual-edit'|'status';
type Result=MobileLifecycleResult|Readonly<{status:200|201;value:object}|{status:409;code:'MODE_CONFLICT'|'MANUAL_IDEMPOTENCY_CONFLICT'}>;
type Row=Record<string,unknown>;
const fail=():never=>{throw new Error('Mobile business unavailable');};
const FORMAT='YYYY-MM-DD"T"HH24:MI:SS.US"Z"';
async function one(tx:OwnerTx,name:string,values:readonly unknown[],command='SELECT'):Promise<Row|undefined>{
 const result=await tx.execute(name,values);if(result.command!==command||result.rowCount!==result.rows.length||result.rows.length>1)return fail();return result.rows[0];
}
function profile(row:Row|undefined):object{
 if(!row)return fail();return parseProfileView({displayName:row.display_name,avatarColourToken:row.avatar_color,avatarEmoji:row.avatar_emoji,
  language:row.language,theme:row.theme,defaultCurrency:row.default_currency,profileComplete:row.profile_complete});
}
export function createPrivateMobileBusiness(authority:Pick<DurablePrivateMobileAuthority,'withCurrentMobileAuthority'>){
 return Object.freeze({async execute(accessToken:string,operation:PrivateMobileBusinessOperation,body:unknown,key?:string):Promise<Result>{
  let parsed:Record<string,unknown>={};let after:{createdAt:string;id:string}|null=null;
  try{
  if(operation==='profile')parsed=parseProfilePatch(body);
  else if(operation==='mode')parseJustMeChoice(body);
  else if(operation==='manual'){parsed=parsePrivateManualCreate(body);if(!key||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(key))throw new Error('wire');}
  else if(operation==='manual-edit'){parsed=parsePrivateMobileManualEdit(body);if(!key||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(key))throw new Error('wire');}
  else if(operation==='status')parsed=parsePrivateMobileStatus(body);
  else if(operation==='owner-read'){
   const request=parsePrivateOwnerPageRequest(body);after=parsePrivateMobileCursor(request.cursor);
  }else if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==0)throw new Error('wire');
  }catch{throw new Error('wire');}
  return authority.withCurrentMobileAuthority(accessToken,async(tx,owner):Promise<Result>=>{
   const identityId=owner.identityId;
   if(operation==='profile-read')return {status:200,value:profile(await one(tx,'profileRead',[identityId]))};
   if(operation==='profile'){
    const values=['displayName','avatarColourToken','avatarEmoji','language','theme'].flatMap(field=>[Object.hasOwn(parsed,field),parsed[field]??null]);
    return {status:200,value:profile(await one(tx,'profilePatch',[identityId,...values],'UPDATE'))};
   }
   if(operation==='mode-read'){
    const mode=await one(tx,'modeRead',[identityId]);if(!mode||(mode.onboarding_mode!==null&&!(mode.onboarding_mode==='just-me'&&mode.profile_complete===true)))return {status:409,code:'MODE_CONFLICT'};
    return {status:200,value:parseModeView({mode:mode.onboarding_mode})};
   }
   if(operation==='mode'){
    const chosen=await one(tx,'modeChoose',[identityId,'just-me'],'UPDATE');const row=chosen??await one(tx,'modeRead',[identityId]);
    if(!row||row.onboarding_mode!=='just-me'||(!chosen&&row.profile_complete!==true))return {status:409,code:'MODE_CONFLICT'};return {status:200,value:parseModeView({mode:'just-me'})};
   }
   const mode=await one(tx,'modeRead',[identityId]);if(mode?.profile_complete!==true||mode.onboarding_mode!=='just-me')return {status:409,code:'MODE_CONFLICT'};
   if(operation==='manual-edit')return executeMobileEdit(tx,identityId,parsed,key!);
   if(operation==='status')return executeMobileStatus(tx,identityId,parsed);
   if(operation==='owner-read'){
    const result=await tx.execute('ownerList',[identityId,after?.createdAt??null,after?.id??null,'UTC',FORMAT]);if(result.command!=='SELECT'||result.rowCount!==result.rows.length||result.rows.length>51)return fail();
    const rows=result.rows.slice(0,50);const items=rows.map(row=>{
     if(row.identity_id!==identityId)return fail();return parsePrivateOwnerView({visibility:'owner',source:row.source,revision:row.revision,id:row.id,customName:row.custom_name,
      merchantId:row.merchant_id,merchantName:row.merchant_name,categoryCode:row.category_code,cadence:row.cadence,status:row.status,expectedAmountMinor:row.expected_amount_minor,currency:row.currency,nextChargeDate:row.next_charge_date,alwaysPrivate:row.always_private});
    });
    const last=rows[49];const nextCursor=result.rows.length===51?encodePrivateMobileCursor(last!.created_at,last!.id):null;
    return {status:200,value:parsePrivateOwnerPage({items,nextCursor})};
   }
   const keyHash=createHash('sha256').update(key!).digest();const hash=createHash('sha256').update(JSON.stringify({v:'manual-create-v1',customName:parsed.customName,categoryCode:parsed.categoryCode,cadence:parsed.cadence,expectedAmountMinor:parsed.expectedAmountMinor,nextChargeDate:parsed.nextChargeDate})).digest();
   const receipt=await one(tx,'manualReceiptRead',[identityId,keyHash]);if(receipt){
    if(!Buffer.isBuffer(receipt.request_hash)||receipt.request_hash.length!==32)return fail();const value=parsePrivateManualCreated({id:receipt.subscription_id});
    return timingSafeEqual(receipt.request_hash,hash)?{status:201,value}:{status:409,code:'MANUAL_IDEMPOTENCY_CONFLICT'};
   }
   const value=parsePrivateManualCreated(await one(tx,'manualIdMint',[]));const inserted=await tx.execute('manualSubscriptionInsert',[value.id,identityId,parsed.customName,parsed.categoryCode,parsed.cadence,parsed.expectedAmountMinor,parsed.nextChargeDate,'MANUAL','ACTIVE','SEK',true]);
   if(inserted.command!=='INSERT'||inserted.rowCount!==1||inserted.rows.length!==0)return fail();const saved=await one(tx,'manualReceiptInsert',[identityId,keyHash,hash,value.id],'INSERT');if(saved?.subscription_id!==value.id)return fail();return {status:201,value};
  });
 }});
}
