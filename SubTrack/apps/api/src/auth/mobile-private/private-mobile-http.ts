import {createPrivateMobileBank} from '../../banks/private-mobile-bank.js';
import type {PrivateMobileBankOperation} from '@subtrack/contracts/private-mobile-bank';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {TLSSocket} from 'node:tls';
import {createRequire} from 'node:module';
import {privateBody,privateJson,rawHeader} from '../enrollment-v2/private-enrollment-http.js';
import {PrivateMobileAuthorityError,type DurablePrivateMobileAuthority} from './durable-mobile-authority.js';
import type {DurablePrivateMobileSessions} from './durable-mobile-sessions.js';
import {createPrivateMobileBusiness,type PrivateMobileBusinessOperation} from '../../profile/private-mobile-business.js';
const {PRIVATE_MOBILE_PATHS:PATHS,parsePrivateMobileEnrollmentComplete,parsePrivateMobileLoginVerify,parsePrivateMobileSessionRequest}=createRequire(__filename)('@subtrack/contracts/private-mobile') as {
 PRIVATE_MOBILE_PATHS:Readonly<Record<string,string>>;
 parsePrivateMobileEnrollmentComplete(value:unknown):{enrollmentProof:string;locale?:'sv'|'en'};
 parsePrivateMobileLoginVerify(value:unknown):{transport:'mobile'};
 parsePrivateMobileSessionRequest(value:unknown):{loginProof:string};
};
const {PRIVATE_MOBILE_BANK_PATHS:BANK_PATHS}=createRequire(__filename)('@subtrack/contracts/private-mobile-bank') as typeof import('@subtrack/contracts/private-mobile-bank');
const HEADERS=new Set(['host','connection','accept','accept-encoding','user-agent','content-type','content-length','authorization','idempotency-key']);
export function privateMobileWire(request:IncomingMessage):void{
 if(process.env.NODE_ENV!=='development'||!(request.socket instanceof TLSSocket)||request.socket.encrypted!==true||request.socket.remoteAddress!=='127.0.0.1'||request.method!=='POST'||request.url?.includes('?')||rawHeader(request,'host')!=='localhost:3443'||request.rawHeaders.length%2!==0)throw new Error('wire');
 const seen=new Set<string>();for(let i=0;i<request.rawHeaders.length;i+=2){const name=request.rawHeaders[i]?.toLowerCase(),value=request.rawHeaders[i+1];
  // eslint-disable-next-line no-control-regex -- Header framing excludes controls; ordinary Accept lists may contain commas.
  if(!name||!HEADERS.has(name)||seen.has(name)||typeof value!=='string'||/[\x00-\x1f\x7f]/.test(value))throw new Error('wire');seen.add(name);}
 const length=rawHeader(request,'content-length');
 if(request.url===PATHS.refresh){if(!(length===null||length==='0')||rawHeader(request,'content-type')!==null)throw new Error('wire');}
 else if(!length||!/^[1-9][0-9]{0,3}$/.test(length)||Number(length)>8192||rawHeader(request,'content-type')!=='application/json')throw new Error('wire');
}
const titles:Record<number,string>={400:'Bad Request',401:'Unauthorized',403:'Forbidden',404:'Not Found',409:'Conflict',429:'Too Many Requests',500:'Internal Server Error'};
function problem(response:ServerResponse,status:number,code?:string):void{
 privateJson(response,status,{type:'about:blank',title:titles[status]!,status,code:code??({400:'INVALID_MOBILE_REQUEST',401:'AUTHENTICATION_REQUIRED',403:'MOBILE_REQUEST_REJECTED',404:'MOBILE_UNAVAILABLE',409:'AUTH_RESTART_REQUIRED',429:'AUTH_RESTART_REQUIRED',500:'INTERNAL_ERROR'} as Record<number,string>)[status]!},true);
}
export function createPrivateMobileHttp(authority:DurablePrivateMobileAuthority,sessions:DurablePrivateMobileSessions){
 const business=createPrivateMobileBusiness(authority);const banks=createPrivateMobileBank(authority);
 return Object.freeze({async handle(request:IncomingMessage,response:ServerResponse):Promise<void>{
  try{
   privateMobileWire(request);const path=request.url;
   if(![...Object.values(PATHS),...Object.values(BANK_PATHS)].includes(path??'')){problem(response,404);return;}
   let body:Record<string,unknown>={};if(path===PATHS.refresh){for await(const chunk of request)if(Buffer.from(chunk as Uint8Array).length!==0)throw new Error('wire');}
   else body={...await privateBody(request)};
   const key=rawHeader(request,'idempotency-key');const authorization=rawHeader(request,'authorization');
   const needsKey=[PATHS.complete,PATHS.verifyLogin,PATHS.session,PATHS.refresh,PATHS.manual,PATHS.manualEdit,BANK_PATHS.connect,BANK_PATHS.sync,BANK_PATHS.disconnect].includes(path);
   if(needsKey?(!key||!/^[\x21-\x7e]{16,255}$/.test(key)):key!==null)throw new Error('wire');
   if([PATHS.complete,PATHS.verifyLogin,PATHS.session].includes(path)){
    if(authorization!==null)throw new Error('wire');
    if(path===PATHS.complete){
     let parsed:ReturnType<typeof parsePrivateMobileEnrollmentComplete>;try{parsed=parsePrivateMobileEnrollmentComplete(body);}catch{throw new Error('wire');}
     const result=await sessions.complete(parsed.enrollmentProof,parsed.locale??'en',key!);if('loginRequired'in result){problem(response,409,'ENROLLMENT_LOGIN_REQUIRED');return;}privateJson(response,201,result);return;
    }
    if(path===PATHS.verifyLogin){try{parsePrivateMobileLoginVerify(body);}catch{throw new Error('wire');}privateJson(response,200,await sessions.verifyLogin('alice',key!));return;}
    let parsed:ReturnType<typeof parsePrivateMobileSessionRequest>;try{parsed=parsePrivateMobileSessionRequest(body);}catch{throw new Error('wire');}privateJson(response,201,await sessions.session(parsed.loginProof,key!));return;
   }
   if(path===PATHS.refresh){if(Object.keys(body).length!==0||!authorization||!/^Refresh v2r\.[A-Za-z0-9_-]{43}$/.test(authorization))throw new Error('wire');privateJson(response,200,await sessions.refresh(authorization.slice(8),key!));return;}
   if(!authorization||!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization)){problem(response,401);return;}
   const accessToken=authorization.slice(7);
   if(path===PATHS.logout){if(Object.keys(body).length!==0)throw new Error('wire');await authority.logout(accessToken);response.setHeader('Cache-Control','no-store');response.setHeader('Pragma','no-cache');response.statusCode=204;response.end();return;}
   const bankOperation=(Object.entries(BANK_PATHS).find(([,value])=>value===path)?.[0]) as PrivateMobileBankOperation|undefined;
   if(bankOperation){const result=await banks.execute(accessToken,bankOperation,body,key??undefined);if('code'in result){problem(response,result.status,result.code);return;}privateJson(response,result.status,result.value);return;}
   const operations:Record<string,PrivateMobileBusinessOperation>={
    [PATHS.profileRead!]:'profile-read',[PATHS.profile!]:'profile',[PATHS.modeRead!]:'mode-read',[PATHS.mode!]:'mode',[PATHS.ownerRead!]:'owner-read',[PATHS.manual!]:'manual',[PATHS.manualEdit!]:'manual-edit',[PATHS.status!]:'status',
   };
   // Closed path roster above, after every non-business path has returned.
   const operation=operations[path!]!;
   const result=await business.execute(accessToken,operation,body,key??undefined);if('code'in result){problem(response,result.status,result.code);return;}privateJson(response,result.status,result.value);
  }catch(error){
   if(error instanceof Error&&error.message==='wire'){problem(response,400);return;}
   if(error instanceof PrivateMobileAuthorityError){problem(response,error.kind==='denied'?401:500);return;}
   problem(response,error instanceof Error&&error.message==='AUTH_RESTART_REQUIRED'?409:500);
  }
 }});
}
