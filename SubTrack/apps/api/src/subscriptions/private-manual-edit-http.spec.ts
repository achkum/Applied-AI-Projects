import type {IncomingMessage,ServerResponse} from 'node:http';
import {createHash} from 'node:crypto';
import {describe,it,expect,vi} from 'vitest';
import {createPrivateManualEditHttp} from './private-manual-edit-http.js';
import {CurrentWebAuthorityError,type DurableCurrentWebAuthority,type OwnerTx} from '../auth/sessions-v2/durable-current-web-authority.js';
vi.mock('../auth/enrollment-v2/private-enrollment-http.js',async importOriginal=>{
 const actual=await importOriginal<typeof import('../auth/enrollment-v2/private-enrollment-http.js')>();
 return {...actual,privateWire:(r:IncomingMessage)=>{if((r as IncomingMessage&{wireFailure?:boolean}).wireFailure)throw new Error('wire');},
 privateBody:async(r:IncomingMessage)=>(r as IncomingMessage&{body:object}).body,
 privateCookies:(r:IncomingMessage)=>(r as IncomingMessage&{cookies:Record<string,string>}).cookies};
});
const secret=Buffer.alloc(32,4).toString('base64url');
const owner='123e4567-e89b-42d3-a456-426614174000';
const id='123e4567-e89b-42d3-a456-426614174001';
const other='123e4567-e89b-42d3-a456-426614174002';
const body={customName:' Example ',categoryCode:'OTHER_SUBSCRIPTION',cadence:'MONTHLY',expectedAmountMinor:'999',nextChargeDate:null,expectedRevision:'1'};
type Query={command:string;rowCount:number;rows:Record<string,unknown>[]};
const query=(command:string,rows:Record<string,unknown>[]):Query=>({command,rowCount:rows.length,rows});
const ready=query('SELECT',[{profile_complete:true,onboarding_mode:'just-me'}]);
const expectedDigest=createHash('sha256').update(JSON.stringify({v:'manual-edit-v1',id,expectedRevision:'1',customName:'Example',categoryCode:'OTHER_SUBSCRIPTION',cadence:'MONTHLY',expectedAmountMinor:'999',nextChargeDate:null})).digest();
const good:Record<string,Query>={manualEditModeRead:ready,manualEditReceiptRead:query('SELECT',[]),manualEditTargetLock:query('SELECT',[{id,revision:'1'}]),
 manualEditCompareUpdate:query('UPDATE',[{id,revision:'2'}]),manualEditReceiptInsert:query('INSERT',[{subscription_id:id,result_revision:'2'}])};
function harness(overrides:Record<string,Query>={},failure?:Error,postFailure?:Error){
 const calls:{name:string;values:readonly unknown[]}[]=[];let entered=0;
 const authority={withCurrentWebAuthority:async(_request:unknown,callback:(tx:OwnerTx,owner:{identityId:string})=>Promise<unknown>)=>{
  entered++;if(failure)throw failure;const result=await callback({execute:async(name:string,values:readonly unknown[])=>{calls.push({name,values});return overrides[name]??good[name]!;}} as OwnerTx,{identityId:owner});
  if(postFailure)throw postFailure;return result;
 }} as unknown as DurableCurrentWebAuthority;
 const request={method:'POST',url:`/v2/subscriptions/owner/manual/${id}/edit`,body,
 cookies:{st_v2_access:'abc.def.ghi',st_v2_binding:secret,st_v2_chain:secret},rawHeaders:['Origin','https://localhost:3443','X-Session-CSRF',secret,'Idempotency-Key',owner]} as unknown as IncomingMessage&{body:object;cookies:Record<string,string>;wireFailure?:boolean};
 let status=0;let payload:Record<string,unknown>={};const headers:Record<string,string>={};
 const response={setHeader:(name:string,value:string)=>{headers[name]=value;},set statusCode(value:number){status=value;},end:(text:string)=>{payload=JSON.parse(text) as Record<string,unknown>;}} as unknown as ServerResponse;
 return {calls,request,headers,get status(){return status;},get payload(){return payload;},get entered(){return entered;},run:()=>createPrivateManualEditHttp(authority).handle(request,response)};
}
describe('private manual Edit current-authority boundary',()=>{
 it('writes only canonical five fields under locked owner/revision and records known snapshot',async()=>{
  const h=harness();await h.run();expect(h.status).toBe(200);expect(h.payload).toEqual({id,revision:'2'});
  expect(h.headers['Cache-Control']).toBe('no-store');expect(h.headers.Pragma).toBe('no-cache');
  expect(h.calls.map(c=>c.name)).toEqual(Object.keys(good));
  expect(h.calls[2]?.values).toEqual([owner,id,'MANUAL','SEK',['WEEKLY','MONTHLY','QUARTERLY','SEMIANNUAL','ANNUAL']]);
  expect(h.calls[3]?.values).toEqual([owner,id,'1','Example','OTHER_SUBSCRIPTION','MONTHLY','999',null,'MANUAL','SEK',['WEEKLY','MONTHLY','QUARTERLY','SEMIANNUAL','ANNUAL']]);
  expect(h.calls[4]?.values[2]).toEqual(expectedDigest);expect(h.calls[4]?.values.slice(3)).toEqual([id,'2']);
 });
 it.each([undefined,{profile_complete:false,onboarding_mode:'just-me'},{profile_complete:true,onboarding_mode:null}])('checks mode before replay %j',async row=>{
  const h=harness({manualEditModeRead:query('SELECT',row?[row]:[])});await h.run();expect(h.status).toBe(409);expect(h.payload.code).toBe('MODE_CONFLICT');expect(h.calls).toHaveLength(1);
 });
 it('replays original result without target lookup even after later update or deletion',async()=>{
  const h=harness({manualEditReceiptRead:query('SELECT',[{request_hash:expectedDigest,subscription_id:id,result_revision:'2'}])});await h.run();
  expect(h.status).toBe(200);expect(h.payload).toEqual({id,revision:'2'});expect(h.calls).toHaveLength(2);
 });
 it.each([{request_hash:Buffer.alloc(32),subscription_id:id,result_revision:'2'},{request_hash:expectedDigest,subscription_id:other,result_revision:'2'}])('conflicts for changed intent or another edit target %j',async row=>{
  const h=harness({manualEditReceiptRead:query('SELECT',[row])});await h.run();expect(h.status).toBe(409);expect(h.payload.code).toBe('MANUAL_EDIT_IDEMPOTENCY_CONFLICT');expect(h.calls).toHaveLength(2);
 });
 it('maps owner-qualified missing/ineligible result to same generic404',async()=>{
  const h=harness({manualEditTargetLock:query('SELECT',[])});await h.run();expect(h.status).toBe(404);expect(h.payload.code).toBe('SUBSCRIPTION_NOT_FOUND');expect(h.calls).toHaveLength(3);
 });
 it('rejects stale snapshot without update or receipt and preserves bigint precision',async()=>{
  const h=harness({manualEditTargetLock:query('SELECT',[{id,revision:'9007199254740993'}])});h.request.body={...body,expectedRevision:'9007199254740992'};
  await h.run();expect(h.status).toBe(409);expect(h.payload.code).toBe('MANUAL_EDIT_CONFLICT');expect(h.calls).toHaveLength(3);
 });
 it.each([new Error('raw SQL secret'),new CurrentWebAuthorityError('storage-unavailable'),new CurrentWebAuthorityError('authority-rejected')])('masks storage and maps only typed current denial %j',async failure=>{
  const h=harness({},failure);await h.run();expect(h.status).toBe(failure instanceof CurrentWebAuthorityError&&failure.kind==='authority-rejected'?401:500);expect(JSON.stringify(h.payload)).not.toContain('secret');
 });
 it('never discloses callback result after unknown commit or reset failure',async()=>{
  const h=harness({},undefined,new Error('unknown-commit'));await h.run();expect(h.status).toBe(500);expect(h.payload.code).toBe('INTERNAL_ERROR');expect(h.payload).not.toHaveProperty('id');
 });
 it.each([{}, {...body,nextChargeDate:undefined},{...body,expectedRevision:'0'},{...body,source:'MANUAL'},{...body,expectedAmountMinor:'0'}])('rejects malformed full replacement before authority %j',async bad=>{
  const h=harness();h.request.body=bad;await h.run();expect(h.status).toBe(400);expect(h.entered).toBe(0);
 });
 it.each(['GET','PATCH'])('rejects wrong method %s',async method=>{const h=harness();h.request.method=method;await h.run();expect(h.status).toBe(400);expect(h.entered).toBe(0);});
 it.each([undefined,'/wrong',`/v2/subscriptions/owner/manual/${id}/edit?x=1`,`/v2/subscriptions/owner/manual/${id.toUpperCase()}/edit`])('rejects noncanonical path %s',async url=>{
  const h=harness();h.request.url=url;await h.run();expect(h.status).toBe(400);expect(h.entered).toBe(0);
 });
 it.each([undefined,'BAD',owner.toUpperCase()])('rejects missing/noncanonical key %s',async key=>{const h=harness();h.request.rawHeaders=h.request.rawHeaders.slice(0,4);if(key)h.request.rawHeaders.push('Idempotency-Key',key);await h.run();expect(h.status).toBe(400);expect(h.entered).toBe(0);});
 it('rejects wire parser failure before body or authority',async()=>{const h=harness();h.request.wireFailure=true;await h.run();expect(h.status).toBe(400);expect(h.entered).toBe(0);});
 it.each([
  ['Origin','https://wrong.example'],['X-Session-CSRF','bad'],
 ])('rejects transport/CSRF %s %s',async(name,value)=>{const h=harness();h.request.rawHeaders[h.request.rawHeaders.indexOf(name)+1]=value;await h.run();expect(h.status).toBe(403);expect(h.entered).toBe(0);});
 it('rejects missing CSRF as403 and malformed empty header as400',async()=>{
  const missing=harness();missing.request.rawHeaders.splice(2,2);await missing.run();expect(missing.status).toBe(403);expect(missing.entered).toBe(0);
  const malformed=harness();malformed.request.rawHeaders[3]='';await malformed.run();expect(malformed.status).toBe(400);expect(malformed.entered).toBe(0);
 });
 it.each([
  {},{st_v2_access:'abc.def.ghi',st_v2_binding:secret,st_v2_chain:secret,extra:secret},
  {st_v2_binding:secret,st_v2_chain:secret,extra:secret},
  {st_v2_access:'abc.def.ghi',st_v2_binding:'bad',st_v2_chain:secret},
  {st_v2_access:'abc.def.ghi',st_v2_chain:secret,extra:secret},
  {st_v2_access:'abc.def.ghi',st_v2_binding:secret,st_v2_chain:'bad'},
  {st_v2_access:'abc.def.ghi',st_v2_binding:secret,extra:secret},
 ])('rejects cookie scope/binding %j',async cookies=>{const h=harness();h.request.cookies=cookies;await h.run();expect(h.status).toBe(403);expect(h.entered).toBe(0);});
 it.each(['','invalid'])('maps missing/invalid access to401 %s',async access=>{const h=harness();h.request.cookies.st_v2_access=access;await h.run();expect(h.status).toBe(401);expect(h.entered).toBe(0);});
});
describe('private Edit storage validation',()=>{
 const corrupt:Record<string,Query[]>={
  manualEditModeRead:[query('UPDATE',[]),{command:'SELECT',rowCount:2,rows:[]},query('SELECT',[{profile_complete:true,onboarding_mode:'just-me'},{profile_complete:true,onboarding_mode:'just-me'}]),query('SELECT',[{profile_complete:1,onboarding_mode:'just-me'}]),query('SELECT',[{profile_complete:true,onboarding_mode:'household'}])],
  manualEditReceiptRead:[query('UPDATE',[]),query('SELECT',[{request_hash:'bad',subscription_id:id,result_revision:'2'}]),query('SELECT',[{request_hash:Buffer.alloc(31),subscription_id:id,result_revision:'2'}]),query('SELECT',[{request_hash:expectedDigest,subscription_id:'bad',result_revision:'2'}]),query('SELECT',[{request_hash:expectedDigest,subscription_id:id,result_revision:'0'}])],
  manualEditTargetLock:[query('UPDATE',[]),query('SELECT',[{id:other,revision:'1'}]),query('SELECT',[{id,revision:'0'}]),query('SELECT',[{id,revision:'1',extra:true}])],
  manualEditCompareUpdate:[query('SELECT',[{id,revision:'2'}]),query('UPDATE',[]),{command:'UPDATE',rowCount:1,rows:[]},query('UPDATE',[{id:other,revision:'2'}]),query('UPDATE',[{id,revision:'1'}]),query('UPDATE',[{id,revision:'3'}])],
  manualEditReceiptInsert:[query('SELECT',[{subscription_id:id,result_revision:'2'}]),query('INSERT',[]),{command:'INSERT',rowCount:1,rows:[]},query('INSERT',[{subscription_id:other,result_revision:'2'}]),query('INSERT',[{subscription_id:id,result_revision:'3'}])],
 };
 for(const [stage,rows] of Object.entries(corrupt))it.each(rows)(`masks malformed ${stage} %j`,async row=>{const h=harness({[stage]:row});await h.run();expect(h.status).toBe(500);expect(h.payload.code).toBe('INTERNAL_ERROR');expect(h.calls.at(-1)?.name).toBe(stage);});
 it('validates the exact next revision above JS safe integer range',async()=>{
  const h=harness({manualEditTargetLock:query('SELECT',[{id,revision:'9007199254740993'}]),manualEditCompareUpdate:query('UPDATE',[{id,revision:'9007199254740994'}]),manualEditReceiptInsert:query('INSERT',[{subscription_id:id,result_revision:'9007199254740994'}])});h.request.body={...body,expectedRevision:'9007199254740993'};
  await h.run();expect(h.status).toBe(200);expect(h.payload.revision).toBe('9007199254740994');
 });
});
