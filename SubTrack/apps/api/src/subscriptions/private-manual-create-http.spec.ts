import type {IncomingMessage,ServerResponse} from 'node:http';
import {describe,it,expect,vi} from 'vitest';
import {createPrivateManualCreateHttp} from './private-manual-create-http.js';
import {CurrentWebAuthorityError,type DurableCurrentWebAuthority,type OwnerTx} from '../auth/sessions-v2/durable-current-web-authority.js';
vi.mock('../auth/enrollment-v2/private-enrollment-http.js',async importOriginal=>{
 const actual=await importOriginal<typeof import('../auth/enrollment-v2/private-enrollment-http.js')>();
 return {...actual,privateWire:()=>undefined,privateBody:async(request:IncomingMessage)=>(request as IncomingMessage & {body:object}).body,
 privateCookies:()=>({st_v2_access:'abc.def.ghi',st_v2_binding:secret,st_v2_chain:secret})};
});
const secret=Buffer.alloc(32,4).toString('base64url');
const owner='123e4567-e89b-42d3-a456-426614174000';
const id='123e4567-e89b-42d3-a456-426614174001';
const body={customName:' Example ',categoryCode:'OTHER_SUBSCRIPTION',cadence:'MONTHLY',expectedAmountMinor:'999'};
type Query={command:string;rowCount:number;rows:Record<string,unknown>[]};
const query=(command:string,rows:Record<string,unknown>[]):Query=>({command,rowCount:rows.length,rows});
function harness(execute:(name:string,values:readonly unknown[])=>Query,options:{body?:object;key?:string;failure?:Error}={}){
 const calls:{name:string;values:readonly unknown[]}[]=[];let entered=0;
 const authority={withCurrentWebAuthority:async(_request:unknown,callback:(tx:OwnerTx,owner:{identityId:string})=>Promise<unknown>)=>{
  entered++;if(options.failure)throw options.failure;
  return callback({execute:async(name:string,values:readonly unknown[])=>{calls.push({name,values});return execute(name,values);}} as OwnerTx,{identityId:owner});
 }} as unknown as DurableCurrentWebAuthority;
 const request={method:'POST',url:'/v2/subscriptions/owner/manual',body:options.body??body,
 rawHeaders:['Origin','https://localhost:3443','X-Session-CSRF',secret,'Idempotency-Key',options.key??owner]} as unknown as IncomingMessage;
 let status=0;let payload:Record<string,unknown>={};const headers:Record<string,string>={};
 const response={setHeader:(name:string,value:string)=>{headers[name]=value;},set statusCode(value:number){status=value;},end:(text:string)=>{payload=JSON.parse(text) as Record<string,unknown>;}} as unknown as ServerResponse;
 return {calls,headers,get status(){return status;},get payload(){return payload;},get entered(){return entered;},run:()=>createPrivateManualCreateHttp(authority).handle(request,response)};
}
const ready=query('SELECT',[{profile_complete:true,onboarding_mode:'just-me'}]);
describe('private manual HTTP',()=>{
 it('inserts fixed owner fields and receipt in order, returns only id',async()=>{
  const h=harness(name=>name==='manualModeRead'?ready:name==='manualReceiptRead'?query('SELECT',[]):name==='manualSubscriptionInsert'?query('INSERT',[{id}]):query('INSERT',[{subscription_id:id}]));
  await h.run();expect(h.status).toBe(201);expect(h.payload).toEqual({id});expect(h.headers['Cache-Control']).toBe('no-store');
  expect(h.calls.map(c=>c.name)).toEqual(['manualModeRead','manualReceiptRead','manualSubscriptionInsert','manualReceiptInsert']);
  expect(h.calls[2]?.values).toEqual([owner,'Example','OTHER_SUBSCRIPTION','MONTHLY','999',null,'MANUAL','ACTIVE','SEK',true]);
  expect(h.calls[1]?.values[1]).toBeInstanceOf(Buffer);expect((h.calls[1]?.values[1] as Buffer).length).toBe(32);
 });
 it('checks mode before receipt even on replay',async()=>{
  const h=harness(()=>query('SELECT',[{profile_complete:false,onboarding_mode:'just-me'}]));await h.run();
  expect(h.status).toBe(409);expect(h.payload.code).toBe('MODE_CONFLICT');expect(h.calls.map(c=>c.name)).toEqual(['manualModeRead']);
 });
 it('replays equal canonical bodies and conflicts on changed receipt hash without insert',async()=>{
  let requestHash:unknown;const first=harness((name,values)=>{if(name==='manualReceiptInsert')requestHash=values[2];return name==='manualModeRead'?ready:name==='manualReceiptRead'?query('SELECT',[]):name==='manualSubscriptionInsert'?query('INSERT',[{id}]):query('INSERT',[{subscription_id:id}]);});await first.run();
  for(const hash of [requestHash,Buffer.alloc(32)]){
   const h=harness(name=>name==='manualModeRead'?ready:query('SELECT',[{request_hash:hash,subscription_id:id}]),{body:{...body,customName:'Example',nextChargeDate:null}});
   await h.run();expect(h.status).toBe(hash===requestHash?201:409);expect(h.calls).toHaveLength(2);
  }
 });
 it('rejects selector/body/key before authority and masks faults with exact denial mapping',async()=>{
  for(const options of [{body:{...body,source:'MANUAL'}},{key:owner.toUpperCase()},{body:{...body,expectedAmountMinor:'0'}}]){
   const h=harness(()=>{throw new Error('unreachable');},options);await h.run();expect(h.status).toBe(400);expect(h.entered).toBe(0);
  }
  for(const failure of [new Error('raw sql'),new CurrentWebAuthorityError('storage-unavailable'),new CurrentWebAuthorityError('authority-rejected')]){
   const h=harness(()=>ready,{failure});await h.run();expect(h.status).toBe(failure instanceof CurrentWebAuthorityError&&failure.kind==='authority-rejected'?401:500);
   expect(JSON.stringify(h.payload)).not.toContain('raw sql');
  }
 });
 it('masks malformed result rows and does not continue to insert',async()=>{
  const h=harness(name=>name==='manualModeRead'?ready:query('SELECT',[{request_hash:'invalid',subscription_id:id}]));await h.run();expect(h.status).toBe(500);expect(h.calls).toHaveLength(2);
 });
});
