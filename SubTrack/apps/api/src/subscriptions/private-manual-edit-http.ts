import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createRequire } from 'node:module';
import { CurrentWebAuthorityError, type DurableCurrentWebAuthority } from '../auth/sessions-v2/durable-current-web-authority.js';
import { canonicalPrivateSecret, privateBody, privateCookies, privateJson, privateWire, rawHeader } from '../auth/enrollment-v2/private-enrollment-http.js';

type Edit = Readonly<{customName:string;categoryCode:string;cadence:string;expectedAmountMinor:string;nextChargeDate:string|null;expectedRevision:string}>;
type Edited = Readonly<{id:string;revision:string}>;
const {parsePrivateManualEdit,parsePrivateManualEdited} = createRequire(__filename)('@subtrack/contracts/private-onboarding') as Readonly<{
  parsePrivateManualEdit(value:unknown):Edit;
  parsePrivateManualEdited(value:unknown):Edited;
}>;
const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CADENCES = Object.freeze(['WEEKLY','MONTHLY','QUARTERLY','SEMIANNUAL','ANNUAL'] as const);
const digest = (value:string):Buffer => createHash('sha256').update(value,'utf8').digest();
function problem(response:ServerResponse,status:number,code?:string):void {
  const titles:Record<number,string>={400:'Bad Request',401:'Unauthorized',403:'Forbidden',404:'Not Found',409:'Conflict',500:'Internal Server Error'};
  const codes:Record<number,string>={400:'INVALID_MANUAL_EDIT_REQUEST',401:'AUTHENTICATION_REQUIRED',403:'MANUAL_EDIT_REQUEST_REJECTED',404:'SUBSCRIPTION_NOT_FOUND',500:'INTERNAL_ERROR'};
  privateJson(response,status,{type:'about:blank',title:titles[status]!,status,code:code??codes[status]!},true);
}
type ModeRow={profile_complete:unknown;onboarding_mode:unknown};
type ReceiptRow={request_hash:unknown;subscription_id:unknown;result_revision:unknown};
type TargetRow={id:unknown;revision:unknown};
type Result={state:'ok';value:Edited}|{state:'mode-conflict'}|{state:'key-conflict'}|{state:'missing'}|{state:'stale'};
function select<Row>(result:{command:string;rowCount:number|null;rows:Row[]}):Row|undefined {
  if(result.command!=='SELECT'||result.rowCount!==result.rows.length||result.rows.length>1)throw new Error('edit-query');
  return result.rows[0];
}
export function createPrivateManualEditHttp(authority:DurableCurrentWebAuthority):Readonly<{
  handle(request:IncomingMessage,response:ServerResponse):Promise<void>;
}> {
  return Object.freeze({async handle(request:IncomingMessage,response:ServerResponse):Promise<void>{
    let entered=false;
    try {
      privateWire(request);
      const match=/^\/v2\/subscriptions\/owner\/manual\/([^/]+)\/edit$/.exec(request.url??'');
      if(request.method!=='POST'||!match||!UUID.test(match[1]!))throw new Error('wire');
      const id=match[1]!;
      const key=rawHeader(request,'idempotency-key');
      if(!key||!KEY.test(key))throw new Error('wire');
      let body:Edit;
      try {body=parsePrivateManualEdit(await privateBody(request));}catch {throw new Error('wire');}
      const origin=rawHeader(request,'origin');const csrf=rawHeader(request,'x-session-csrf');
      const cookies=privateCookies(request);
      if(origin!=='https://localhost:3443'||!csrf||!canonicalPrivateSecret(csrf)||Object.keys(cookies).length!==3||
        !Object.hasOwn(cookies,'st_v2_access')||!canonicalPrivateSecret(cookies.st_v2_binding??'')||!canonicalPrivateSecret(cookies.st_v2_chain??'')){
        problem(response,403);return;
      }
      if(!cookies.st_v2_access||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(cookies.st_v2_access)){
        problem(response,401);return;
      }
      const keyHash=digest(key);
      const requestHash=digest(JSON.stringify({v:'manual-edit-v1',id,expectedRevision:body.expectedRevision,
        customName:body.customName,categoryCode:body.categoryCode,cadence:body.cadence,
        expectedAmountMinor:body.expectedAmountMinor,nextChargeDate:body.nextChargeDate}));
      entered=true;
      const result:Result=await authority.withCurrentWebAuthority({accessToken:cookies.st_v2_access,exactOrigin:origin,
        bindingCookie:cookies.st_v2_binding!,browserChainId:cookies.st_v2_chain!,csrfToken:csrf},async(tx,owner):Promise<Result>=>{
        const mode=select(await tx.execute<ModeRow>('manualEditModeRead',[owner.identityId]));
        if(mode&&(typeof mode.profile_complete!=='boolean'||!(mode.onboarding_mode===null||mode.onboarding_mode==='just-me')))throw new Error('edit-mode');
        if(!mode||mode.profile_complete!==true||mode.onboarding_mode!=='just-me')return {state:'mode-conflict'};
        const receipt=select(await tx.execute<ReceiptRow>('manualEditReceiptRead',[owner.identityId,keyHash]));
        if(receipt){
          if(!Buffer.isBuffer(receipt.request_hash)||receipt.request_hash.length!==32)throw new Error('edit-receipt');
          const value=parsePrivateManualEdited({id:receipt.subscription_id,revision:receipt.result_revision});
          if(value.id!==id) return {state:'key-conflict'};
          return timingSafeEqual(receipt.request_hash,requestHash)?{state:'ok',value}:{state:'key-conflict'};
        }
        const target=select(await tx.execute<TargetRow>('manualEditTargetLock',[owner.identityId,id,'MANUAL','SEK',...CADENCES]));
        if(!target)return {state:'missing'};
        const current=parsePrivateManualEdited(target);
        if(current.id!==id)throw new Error('edit-target');
        if(current.revision!==body.expectedRevision)return {state:'stale'};
        const updated=await tx.execute<TargetRow>('manualEditCompareUpdate',[owner.identityId,id,body.expectedRevision,
          body.customName,body.categoryCode,body.cadence,body.expectedAmountMinor,body.nextChargeDate,'MANUAL','SEK',...CADENCES]);
        if(updated.command!=='UPDATE'||updated.rowCount!==1||updated.rows.length!==1)throw new Error('edit-update');
        const value=parsePrivateManualEdited(updated.rows[0]);
        if(value.id!==id||BigInt(value.revision)!==BigInt(body.expectedRevision)+1n)throw new Error('edit-revision');
        const saved=await tx.execute<ReceiptRow>('manualEditReceiptInsert',[owner.identityId,keyHash,requestHash,id,value.revision]);
        if(saved.command!=='INSERT'||saved.rowCount!==1||saved.rows.length!==1||saved.rows[0]?.subscription_id!==id||saved.rows[0]?.result_revision!==value.revision)throw new Error('edit-receipt-write');
        return {state:'ok',value};
      });
      if(result.state==='mode-conflict'){problem(response,409,'MODE_CONFLICT');return;}
      if(result.state==='key-conflict'){problem(response,409,'MANUAL_EDIT_IDEMPOTENCY_CONFLICT');return;}
      if(result.state==='missing'){problem(response,404);return;}
      if(result.state==='stale'){problem(response,409,'MANUAL_EDIT_CONFLICT');return;}
      privateJson(response,200,parsePrivateManualEdited(result.value));
    }catch(error){
      problem(response,!entered&&error instanceof Error&&error.message==='wire'?400:
        error instanceof CurrentWebAuthorityError&&error.kind==='authority-rejected'?401:500);
    }
  }});
}
