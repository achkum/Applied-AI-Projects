import { Readable } from 'node:stream';
import { TLSSocket } from 'node:tls';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DurableDevelopmentLogin } from './durable-development-login.js';
import type { V2AccessToken } from '../sessions-v2/v2-access-token.js';
import { createPrivateLoginHttp, privateLoginProblem } from './private-login-http.js';

const token=(byte:number):string=>Buffer.alloc(32,byte).toString('base64url');
const OWNER='00000000-0000-4000-8000-000000000001';
const SESSION='00000000-0000-4000-8000-000000000002';
const VERIFY='/v2/auth/login/simulator/verify';
const SESSION_PATH='/v2/auth/session';
const VERIFY_REQUEST_ID=['verify','key',1234567].join('-');
const verified={loginProof:`v2.${token(6)}`,nextBrowserNonce:token(7)};
const session={identityId:OWNER,sessionId:SESSION,refreshToken:`v2r.${token(8)}`,csrfToken:token(9),browserChainId:token(5)};

function fixture() {
  const verifySimulatorLogin=vi.fn().mockResolvedValue(verified);
  const createV2Session=vi.fn().mockResolvedValue(session);
  const issue=vi.fn().mockReturnValue(`v2a.${token(10)}`);
  const handler=createPrivateLoginHttp({login:{verifySimulatorLogin,createV2Session} as unknown as DurableDevelopmentLogin,
    accessTokens:{issue} as unknown as V2AccessToken});
  return {handler,verifySimulatorLogin,createV2Session,issue};
}
type Response=Readonly<{status:number;body:Record<string,unknown>;headers:Readonly<Record<string,string|string[]>>}>;
async function call(handler:ReturnType<typeof createPrivateLoginHttp>,path:string,body:string,extra:string[]=[],method='POST',
  cookie=`st_v2_binding=${token(1)}`,origin='https://localhost:3443'):Promise<Response> {
  const request=Readable.from([Buffer.from(body,'utf8')]) as IncomingMessage;
  const socket=Object.create(TLSSocket.prototype) as TLSSocket;
  Object.defineProperties(socket,{remoteAddress:{value:'127.0.0.1'},encrypted:{value:true}});
  Object.defineProperty(request,'socket',{value:socket});
  request.method=method;request.url=path;
  request.rawHeaders=['Host','localhost:3443','Content-Type','application/json','Content-Length',String(Buffer.byteLength(body)),
    'Origin',origin,'Idempotency-Key',VERIFY_REQUEST_ID,'X-Browser-Nonce',token(2),
    ...(cookie===null?[]:['Cookie',cookie]),...extra];
  const headers:Record<string,string|string[]>={};
  let output='';
  const response={statusCode:200,setHeader:(name:string,value:string|string[])=>{headers[name.toLowerCase()]=value;},
    end:(value:string)=>{output=value;}} as unknown as ServerResponse;
  await handler.handle(request,response);
  return {status:response.statusCode,body:JSON.parse(output) as Record<string,unknown>,headers};
}
beforeEach(()=>vi.stubEnv('NODE_ENV','development'));
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});

describe('private returning login HTTP',()=>{
  it('maps launcher login method and unavailable-route failures to login problem codes',()=>{
    for (const [status,code] of [[400,'INVALID_LOGIN_REQUEST'],[404,'LOGIN_UNAVAILABLE']] as const) {
      const headers:Record<string,string|string[]>={};let output='';
      const response={statusCode:200,setHeader:(name:string,value:string|string[])=>{headers[name.toLowerCase()]=value;},
        end:(value:string)=>{output=value;}} as unknown as ServerResponse;
      privateLoginProblem(response,status);
      expect(response.statusCode).toBe(status);
      expect(JSON.parse(output)).toMatchObject({status,code});
      expect(headers['cache-control']).toBe('no-store');
      expect(headers['set-cookie']).toBeUndefined();
    }
  });
  it('returns only proof and successor nonce after trusted verification, without session cookies',async()=>{
    const f=fixture();
    const valid=await call(f.handler,VERIFY,JSON.stringify({transport:'web',demoIdentity:'bob'}),[], 'POST',
      `st_v2_binding=${token(1)}; st_v2_access=expired; st_v2_refresh=old; st_v2_chain=old`);
    expect(valid).toMatchObject({status:200,body:{transport:'web',status:'verified',...verified}});
    expect(valid.headers['set-cookie']).toBeUndefined();
    expect(valid.headers['cache-control']).toBe('no-store');
    expect(f.verifySimulatorLogin).toHaveBeenCalledWith(expect.objectContaining({bindingCookie:token(1),nonce:token(2),chainId:''}),
      {demoIdentity:'bob'},VERIFY_REQUEST_ID);
    expect(f.createV2Session).not.toHaveBeenCalled();
  });

  it('accepts inert stale session cookies without reading them as owner, chain or proof',async()=>{
    const f=fixture();
    const body=JSON.stringify({transport:'web',loginProof:verified.loginProof});
    const fresh=await call(f.handler,SESSION_PATH,body,[],'POST',
      `st_v2_binding=${token(1)}; st_v2_access=old-owner; st_v2_refresh=expired; st_v2_chain=foreign`);
    expect(fresh.status).toBe(201);
    expect(f.createV2Session).toHaveBeenCalledWith(expect.objectContaining({chainId:'',bindingCookie:token(1)}),
      {loginProof:verified.loginProof},VERIFY_REQUEST_ID);
    expect(f.issue).toHaveBeenCalledWith(OWNER,SESSION);
    expect(fresh.body).toEqual({transport:'web',sessionId:SESSION,csrfToken:session.csrfToken});
    expect(fresh.headers['set-cookie']).toEqual([
      expect.stringMatching(/^st_v2_access=.*; Path=\/v2; Secure; HttpOnly; SameSite=Lax$/),
      expect.stringMatching(/^st_v2_refresh=.*; Path=\/v2\/auth; Secure; HttpOnly; SameSite=Lax$/),
      expect.stringMatching(/^st_v2_chain=.*; Path=\/v2; Secure; HttpOnly; SameSite=Lax$/),
    ]);
  });

  it.each([
    ['duplicate JSON','{"transport":"web","demoIdentity":"alice","demoIdentity":"bob"}',[]],
    ['extra owner','{"transport":"web","demoIdentity":"alice","identityId":"x"}',[]],
    ['trailing JSON','{"transport":"web","demoIdentity":"alice"}x',[]],
    ['asserted subject','{"transport":"web","subjectHmac":"x"}',[]],
    ['duplicate Origin','{"transport":"web","demoIdentity":"alice"}',['Origin','https://localhost:3443']],
    ['unknown cookie','{"transport":"web","demoIdentity":"alice"}',['Cookie','foreign=x']],
    ['bearer','{"transport":"web","demoIdentity":"alice"}',['Authorization','Bearer x']],
    ['session CSRF','{"transport":"web","demoIdentity":"alice"}',['X-Session-CSRF',token(3)]],
  ])('rejects %s before service work',async(_label,body,extra)=>{
    const f=fixture();const result=await call(f.handler,VERIFY,body,extra);
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({code:'INVALID_LOGIN_REQUEST'});
    expect(f.verifySimulatorLogin).not.toHaveBeenCalled();
  });

  it('classifies Origin rejection and missing binding without reaching service',async()=>{
    const f=fixture();const body=JSON.stringify({transport:'web',demoIdentity:'alice'});
    const origin=await call(f.handler,VERIFY,body,[],'POST',`st_v2_binding=${token(1)}`,'https://wrong.invalid');
    expect(origin).toMatchObject({status:403,body:{code:'AUTH_ORIGIN_REJECTED'}});
    const binding=await call(f.handler,VERIFY,body,[],'POST','st_v2_binding=bad');
    expect(binding).toMatchObject({status:403,body:{code:'AUTH_ORIGIN_REJECTED'}});
    expect(f.verifySimulatorLogin).not.toHaveBeenCalled();
  });

  it('keeps 409 and unexpected 500 responses free of new credentials',async()=>{
    const f=fixture();f.createV2Session.mockRejectedValueOnce(new Error('AUTH_RESTART_REQUIRED'));
    const body=JSON.stringify({transport:'web',loginProof:verified.loginProof});
    const conflict=await call(f.handler,SESSION_PATH,body);
    expect(conflict).toMatchObject({status:409,body:{code:'AUTH_RESTART_REQUIRED'}});
    expect(conflict.headers['set-cookie']).toBeUndefined();
    expect(f.issue).not.toHaveBeenCalled();
    f.issue.mockImplementationOnce(()=>{throw new Error('token issuer fault');});
    const fault=await call(f.handler,SESSION_PATH,body);
    expect(fault).toMatchObject({status:500,body:{code:'INTERNAL_ERROR'}});
    expect(fault.headers['set-cookie']).toBeUndefined();
    expect(fault.body).not.toHaveProperty('csrfToken');
  });
});
