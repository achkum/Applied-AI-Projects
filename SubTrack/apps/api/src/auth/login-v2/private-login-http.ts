import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DurableDevelopmentLogin } from './durable-development-login.js';
import type { V2AccessToken } from '../sessions-v2/v2-access-token.js';
import type { EnrollmentWeb } from '../enrollment-v2/durable-development-enrollment.js';
import { canonicalPrivateSecret, exactBody, privateBody, privateCookies, privateJson,
  privateWire, rawHeader } from '../enrollment-v2/private-enrollment-http.js';

const ORIGIN = 'https://localhost:3443';
const KEY = /^[\x21-\x7e]{16,255}$/;
const COOKIE_NAMES = ['st_v2_binding','st_v2_access','st_v2_refresh','st_v2_chain'];
const PROBLEMS: Readonly<Record<number, Readonly<{type:'about:blank';title:string;status:number;code:string}>>> = {
  400:{type:'about:blank',title:'Authentication unavailable',status:400,code:'INVALID_LOGIN_REQUEST'},
  403:{type:'about:blank',title:'Authentication unavailable',status:403,code:'AUTH_ORIGIN_REJECTED'},
  404:{type:'about:blank',title:'Authentication unavailable',status:404,code:'LOGIN_UNAVAILABLE'},
  409:{type:'about:blank',title:'Authentication unavailable',status:409,code:'AUTH_RESTART_REQUIRED'},
  500:{type:'about:blank',title:'Authentication unavailable',status:500,code:'INTERNAL_ERROR'},
};
export const privateLoginProblem=(response:ServerResponse,status:number):void=>
  privateJson(response,status,PROBLEMS[status]??PROBLEMS[500]!,true);
const problem=privateLoginProblem;

export function createPrivateLoginHttp(deps: Readonly<{login:DurableDevelopmentLogin;accessTokens:V2AccessToken}>):
  Readonly<{handle(request:IncomingMessage,response:ServerResponse):Promise<void>}> {
  return Object.freeze({async handle(request:IncomingMessage,response:ServerResponse):Promise<void> {
    try {
      privateWire(request);
      const path=request.url;
      if (request.method!=='POST' || (path!=='/v2/auth/login/simulator/verify' && path!=='/v2/auth/session')) {
        problem(response,404); return;
      }
      const body=await privateBody(request);
      if (rawHeader(request,'origin')!==ORIGIN) { problem(response,403); return; }
      const key=rawHeader(request,'idempotency-key');
      if (!key || !KEY.test(key) || rawHeader(request,'x-session-csrf')!==null) throw new Error('wire');
      const cookies=privateCookies(request);
      if (Object.keys(cookies).some(name=>!COOKIE_NAMES.includes(name))) throw new Error('wire');
      if (!canonicalPrivateSecret(cookies.st_v2_binding??'')) { problem(response,403); return; }
      const nonce=rawHeader(request,'x-browser-nonce');
      if (!nonce || !canonicalPrivateSecret(nonce)) throw new Error('wire');
      const web:EnrollmentWeb={origin:ORIGIN,bindingCookie:cookies.st_v2_binding!,nonce,chainId:'',epoch:'st237_private_https_v1'};
      if (path==='/v2/auth/login/simulator/verify') {
        exactBody(body,['transport','demoIdentity']);
        if (body.transport!=='web' || (body.demoIdentity!=='alice' && body.demoIdentity!=='bob')) throw new Error('wire');
        const verified=await deps.login.verifySimulatorLogin(web,{demoIdentity:body.demoIdentity},key);
        privateJson(response,200,{transport:'web',loginProof:verified.loginProof,status:'verified',
          nextBrowserNonce:verified.nextBrowserNonce}); return;
      }
      exactBody(body,['transport','loginProof']);
      if (body.transport!=='web' || typeof body.loginProof!=='string' ||
        !/^v2\.[A-Za-z0-9_-]{43}$/.test(body.loginProof) || !canonicalPrivateSecret(body.loginProof.slice(3))) throw new Error('wire');
      const session=await deps.login.createV2Session(web,{loginProof:body.loginProof},key);
      const access=deps.accessTokens.issue(session.identityId,session.sessionId);
      privateJson(response,201,{transport:'web',sessionId:session.sessionId,csrfToken:session.csrfToken},false,[
        `st_v2_access=${access}; Path=/v2; Secure; HttpOnly; SameSite=Lax`,
        `st_v2_refresh=${session.refreshToken}; Path=/v2/auth; Secure; HttpOnly; SameSite=Lax`,
        `st_v2_chain=${session.browserChainId}; Path=/v2; Secure; HttpOnly; SameSite=Lax`,
      ]);
    } catch(error) { problem(response,error instanceof Error && error.message==='wire'?400:
      error instanceof Error && error.message==='AUTH_RESTART_REQUIRED'?409:500); }
  }});
}
