import {PRIVATE_MOBILE_BANK_STATEMENTS} from '../../banks/private-mobile-bank-statements.js';
import {PRIVATE_MOBILE_DETECTION_STATEMENTS} from '../../detection/private-mobile-detection-statements.js';
import {createServer,type Server,type ServerOptions} from 'node:https';
import {Readable} from 'node:stream';
import type {IncomingMessage,ServerResponse} from 'node:http';
import type {Pool} from 'pg';
import type {Request,Response} from 'express';
import {privateBody,privateJson} from '../enrollment-v2/private-enrollment-http.js';
import {DevelopmentMobileEnrollmentOtpHttpService,type MobileEnrollmentOtpHttpConfig} from '../otp-v2/mobile-enrollment-otp-http.js';
import {OtpRateLimiter} from '../otp-v2/otp-http.js';
import {InMemoryIdempotencyGuard} from '../idempotency/idempotency-guard.js';
import {MobileEnrollmentChallengeStore} from '../proofs-v2/mobile-enrollment-challenge-store.js';
import {InMemoryOtpChallengeRepository,OtpProofProducer,type MobileEnrollmentIssuance} from '../proofs-v2/otp-proof-producer.js';
import {InMemoryProofRepository,ProofStore} from '../proofs-v2/proof-store.js';
import {DevelopmentEnrollmentPersonVerifier} from '../identity-provider/development-enrollment-person-verifier.js';
import {V2AccessToken} from '../sessions-v2/v2-access-token.js';
import {DurablePrivateMobileAuthority} from './durable-mobile-authority.js';
import {PrivateMobileSubjectVerifier} from './verified-subject-binding.js';
import {PrivateMobileEnrollmentAdmission} from './enrollment-admission.js';
import {DurablePrivateMobileSessions} from './durable-mobile-sessions.js';
import {createPrivateMobileHttp,privateMobileWire} from './private-mobile-http.js';
import {PRIVATE_MOBILE_BUSINESS_STATEMENTS} from '../../profile/private-mobile-business.js';
export type PrivateMobileServerConfig=Readonly<{
 environment:'development';enabled:true;tls:ServerOptions;pool:Pick<Pool,'connect'>;clock:()=>number;manifestHash:string;
 accessTokens:V2AccessToken;
 /** Synthetic owned-fixture RAM callback only; never register an HTTP/log/artifact transport. */
 onSyntheticOtpIssued?:(event:Readonly<{code:string;channel:'sms'|'email';expiresAt:number}>)=>void;
 keys:Readonly<{otp:Uint8Array;rate:Uint8Array;idempotency:Uint8Array;anonymous:Uint8Array;subject:Uint8Array;person:Uint8Array;simulator:Uint8Array;credentialKeys:readonly Uint8Array[]}>;
}>;
function expressResponse(response:ServerResponse):Response{
 const adapter={setHeader:response.setHeader.bind(response),get headersSent(){return response.headersSent;},
  status(status:number){response.statusCode=status;return adapter;},type(type:string){response.setHeader('Content-Type',type);return adapter;},send(value:object){response.end(JSON.stringify(value));return adapter;}};
 return adapter as unknown as Response;
}
/** Explicit separate loopback mobile graph, with no default or web-module registration. */
export function createPrivateMobileServer(config:PrivateMobileServerConfig):Readonly<{
 server:Server;authority:DurablePrivateMobileAuthority;sessions:DurablePrivateMobileSessions;challenges:MobileEnrollmentChallengeStore;
}>{
 if(config.environment!=='development'||config.enabled!==true||process.env.NODE_ENV!=='development'||!(config.accessTokens instanceof V2AccessToken)||!config.tls.key||!config.tls.cert)throw new Error('Mobile server unavailable');
 const clock=config.clock;const keys=config.keys;const proofs=new ProofStore(new InMemoryProofRepository(),clock);
 const callback=config.onSyntheticOtpIssued;
 if(callback!==undefined&&typeof callback!=='function')throw new Error('Mobile server unavailable');
 class SyntheticFixtureChallengeStore extends MobileEnrollmentChallengeStore{
  override publish(slot:string,issuance:MobileEnrollmentIssuance,code:string):MobileEnrollmentIssuance{
   const published=super.publish(slot,issuance,code);callback?.(Object.freeze({code,channel:published.channel,expiresAt:published.expiresAt}));return published;
  }
 }
 const challenges=new SyntheticFixtureChallengeStore(clock);const admission=new PrivateMobileEnrollmentAdmission(proofs,clock);
 const separated=[keys.otp,keys.rate,keys.idempotency,keys.anonymous,keys.person,keys.simulator,...keys.credentialKeys];
 const verifier=new DevelopmentEnrollmentPersonVerifier({environment:'development',enabled:true,simulatorHmacKey:keys.simulator,clock});
 const subjects=new PrivateMobileSubjectVerifier(verifier,clock,config.manifestHash,keys.subject,separated,keys.person);
 const authority=new DurablePrivateMobileAuthority(config.pool,config.accessTokens,clock,config.manifestHash,{...PRIVATE_MOBILE_BUSINESS_STATEMENTS,...PRIVATE_MOBILE_BANK_STATEMENTS,...PRIVATE_MOBILE_DETECTION_STATEMENTS},true);
 const sessions=new DurablePrivateMobileSessions(authority,subjects,admission,config.accessTokens);
 const otpConfig:MobileEnrollmentOtpHttpConfig={environment:'development',enabled:true,clock,anonymousBindingKey:keys.anonymous,otpKey:keys.otp,rateKey:keys.rate,idempotencyKey:keys.idempotency,
  originKeys:[keys.subject,keys.person,keys.simulator],credentialKeys:keys.credentialKeys};
 const otp=new DevelopmentMobileEnrollmentOtpHttpService(otpConfig,{idempotency:new InMemoryIdempotencyGuard({key:keys.idempotency,ttlMs:86400000,clock}),challenges,
  producer:new OtpProofProducer(keys.otp,new InMemoryOtpChallengeRepository(),proofs,clock),rates:new OtpRateLimiter(Buffer.from(keys.rate),clock),admission});
 const mobile=createPrivateMobileHttp(authority,sessions);
 const server=createServer(config.tls,async(request,response)=>{
  try{
   if(request.url==='/v2/auth/otp/start'||request.url==='/v2/auth/otp/verify'){
    privateMobileWire(request);
    const chunks:Buffer[]=[];let length=0;for await(const chunk of request){const bytes=Buffer.from(chunk as Uint8Array);length+=bytes.length;if(length>4096)throw new Error('wire');chunks.push(bytes);}
    const rawBody=Buffer.concat(chunks);const replay=Object.assign(Readable.from([rawBody]),{rawHeaders:request.rawHeaders}) as unknown as IncomingMessage;
    const body={...await privateBody(replay)};
    const direct=Object.assign(request,{rawBody,originalUrl:request.url,secure:true}) as unknown as Request;
    await (request.url.endsWith('/start')?otp.start(body,direct,expressResponse(response)):otp.verify(body,direct,expressResponse(response)));return;
   }
   await mobile.handle(request,response);
  }catch{if(!response.headersSent)privateJson(response,400,{type:'about:blank',title:'Bad Request',status:400,code:'INVALID_MOBILE_REQUEST'},true);else response.destroy();}
 });
 return Object.freeze({server,authority,sessions,challenges});
}
