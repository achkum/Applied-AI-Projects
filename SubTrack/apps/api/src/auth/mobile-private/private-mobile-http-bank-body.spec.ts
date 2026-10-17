import {Readable} from 'node:stream';
import {TLSSocket} from 'node:tls';
import {Socket} from 'node:net';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {createPrivateMobileHttp} from './private-mobile-http.js';
import type {DurablePrivateMobileAuthority} from './durable-mobile-authority.js';
import type {DurablePrivateMobileSessions} from './durable-mobile-sessions.js';
import type {OwnerTx} from '../sessions-v2/durable-current-web-authority.js';
const ownerId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',connectionId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',intentId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
function fixture(path:string,text:string,options:{complete?:boolean;headers?:string[];omitBearer?:boolean;omitIntent?:boolean}={}){
 vi.stubEnv('NODE_ENV','development');const socket=new TLSSocket(new Socket());Object.defineProperty(socket,'remoteAddress',{value:'127.0.0.1'});
 const rawHeaders=['Host','localhost:3443','Content-Type','application/json','Content-Length',String(Buffer.byteLength(text)),...options.omitBearer?[]:['Authorization','Bearer a.b.c'],...options.omitIntent?[]:['Idempotency-Key',intentId],...options.headers??[]];
 const request=Object.assign(Readable.from([Buffer.from(text)]),{method:'POST',url:path,rawHeaders,socket}) as unknown as IncomingMessage;
 const execute=vi.fn(async(name:string)=>{const rows=name==='modeRead'?[{profile_complete:options.complete===true,onboarding_mode:'just-me'}]:[];return {command:'SELECT',rows,rowCount:rows.length};});
 const withCurrentMobileAuthority=vi.fn(async(_token:string,work:(tx:OwnerTx,owner:{identityId:string})=>Promise<unknown>)=>work({execute} as unknown as OwnerTx,{identityId:ownerId}));
 const authority={withCurrentMobileAuthority} as unknown as DurablePrivateMobileAuthority;
 let status=0;let payload:Record<string,unknown>|undefined;
 const response={setHeader:vi.fn(),set statusCode(value:number){status=value;},end(value?:string){if(value)payload=JSON.parse(value) as Record<string,unknown>;}} as unknown as ServerResponse;
 return {request,execute,withCurrentMobileAuthority,get status(){return status;},get payload(){return payload;},run:()=>createPrivateMobileHttp(authority,{} as DurablePrivateMobileSessions).handle(request,response)};
}
afterEach(()=>vi.unstubAllEnvs());
describe('bank boolean body reaches unchanged private HTTP authority',()=>{
 it('false and true reach profile gate, then exact foreign connection owner denial',async()=>{
  for(const purge of [false,true]){
   const body=JSON.stringify({connectionId,purge});const mode=fixture('/v2/private/mobile/banks/synthetic/disconnect',body);await mode.run();expect(mode.status).toBe(409);expect(mode.payload?.code).toBe('MODE_CONFLICT');expect(mode.withCurrentMobileAuthority).toHaveBeenCalledOnce();
   const foreign=fixture('/v2/private/mobile/banks/synthetic/disconnect',body,{complete:true});await foreign.run();expect(foreign.status).toBe(409);expect(foreign.payload?.code).toBe('BANK_STATE_CONFLICT');expect(foreign.execute).toHaveBeenCalledWith('bankLock',[ownerId,connectionId,'SYNTHETIC','synthetic-demo-v1']);expect(foreign.execute.mock.calls.map(call=>call[0])).not.toContain('bankRevoke');
  }
 });
 it('rejects boolean strings/wrong fields/duplicates/malformed before current authority',async()=>{
  for(const body of [`{"connectionId":"${connectionId}","purge":"false"}`,`{"connectionId":true,"purge":false}`,`{"connectionId":"${connectionId}","purge":false,"pu\\u0072ge":true}`,`{"connectionId":"${connectionId}","purge":false,"__proto__":"x"}`,`{"connectionId":"${connectionId}","purge":null}`,`{"connectionId":"${connectionId}","purge":false} trailing`]){
   const f=fixture('/v2/private/mobile/banks/synthetic/disconnect',body);await f.run();expect(f.status).toBe(400);expect(f.withCurrentMobileAuthority).not.toHaveBeenCalled();
  }
  for(const path of ['read','connect','sync']){const f=fixture(`/v2/private/mobile/banks/synthetic/${path}`,'{"purge":true}',{omitIntent:path==='read'});await f.run();expect(f.status).toBe(400);expect(f.withCurrentMobileAuthority).not.toHaveBeenCalled();}
 });
 it('preserves framing/header/Bearer/key and exact bank path isolation',async()=>{
  const body=JSON.stringify({connectionId,purge:false});
  for(const options of [{omitBearer:true},{omitIntent:true},{headers:['Cookie','fixture']},{headers:['Authorization','Bearer d.e.f']}]){const f=fixture('/v2/private/mobile/banks/synthetic/disconnect',body,options);await f.run();expect([400,401]).toContain(f.status);expect(f.withCurrentMobileAuthority).not.toHaveBeenCalled();}
  for(const path of ['/v2/private/mobile/profile','/v2/private/mobile/banks/synthetic/disconnect/extra']){const f=fixture(path,body,{omitIntent:path.endsWith('profile')});await f.run();expect([400,404]).toContain(f.status);expect(f.withCurrentMobileAuthority).not.toHaveBeenCalled();}
 });
});
