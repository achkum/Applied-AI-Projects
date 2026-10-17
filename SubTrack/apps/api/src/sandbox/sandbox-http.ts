import type {IncomingMessage,ServerResponse} from 'node:http';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';
import {createRequire} from 'node:module';
import {createSandboxBankBusiness} from './sandbox-bank-business.js';
import {createSandboxHouseholdBusiness} from './sandbox-household.js';
import {createPrivateMobileBusiness,type PrivateMobileBusinessOperation} from '../profile/private-mobile-business.js';
import {SandboxAuthority,SandboxError} from './sandbox-authority.js';
import {SandboxSession} from './sandbox-session.js';
// The strict runtime decoder validates the complete envelope. A local structural
// port preserves the emitting API build's inferred source root and entrypoints.
type SandboxBusinessOperation=PrivateMobileBusinessOperation|SandboxHouseholdOperation
 |'subscription-edit'|'subscription-status'
 |'bank-read'|'bank-connect'|'bank-sync'|'bank-disconnect'|'bank-history'
 |'detection-read'|'detection-scan'|'detection-confirm'|'detection-reject'|'detection-undo';
type SandboxHouseholdOperation=Parameters<ReturnType<typeof createSandboxHouseholdBusiness>['execute']>[1];
const wire=createRequire(__filename)('@subtrack/contracts/sandbox-mobile') as {
 SANDBOX_MOBILE_PATHS:Readonly<Record<'bootstrap'|'resume'|'refresh'|'logout'|'business',string>>;
 parseSandboxRequestKey(value:unknown):string;parseSandboxSecret(value:unknown,kind:'capability'|'refresh'):string;
 parseSandboxBootstrap(value:unknown):object;parseSandboxTransport(value:unknown):object;
 parseSandboxBusiness(value:unknown):Readonly<{operation:SandboxBusinessOperation;body:object}>;
};
const invalid=():never=>{throw new Error('Sandbox wire rejected');};
/** Bounded raw JSON parser: duplicate decoded keys and trailing material never reach dispatch. */
export function parseSandboxJson(raw:string):unknown{
 if(Buffer.byteLength(raw,'utf8')>8192)return invalid();let offset=0,nodes=0;
 const space=()=>{while([' ','\t','\n','\r'].includes(raw[offset]??'!'))offset++;};
 const string=()=>{if(raw[offset++]!=='"')return invalid();const start=offset-1;while(offset<raw.length){const ch=raw[offset++]!;if(ch==='\\')offset++;else if(ch==='"')return JSON.parse(raw.slice(start,offset)) as string;}return invalid();};
 function value(depth:number):unknown{
  if(depth>4||++nodes>128)return invalid();space();const ch=raw[offset];
  if(ch==='"')return string();
  if(ch==='{'){offset++;space();const result:Record<string,unknown>={},seen=new Set<string>();if(raw[offset]==='}'){offset++;return result;}
   while(true){space();const key=string();if(seen.has(key)||['__proto__','constructor','prototype'].includes(key))return invalid();seen.add(key);space();if(raw[offset++]!==':')return invalid();result[key]=value(depth+1);space();const delimiter=raw[offset++];if(delimiter==='}')return result;if(delimiter!==',')return invalid();}
  }
  if(ch==='['){offset++;space();const result:unknown[]=[];if(raw[offset]===']'){offset++;return result;}while(true){result.push(value(depth+1));space();const delimiter=raw[offset++];if(delimiter===']')return result;if(delimiter!==',')return invalid();}}
  const token=/^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(raw.slice(offset));if(!token)return invalid();offset+=token[0].length;const result:unknown=JSON.parse(token[0]);if(typeof result==='number'&&!Number.isFinite(result))return invalid();return result;
 }
 const result=value(0);space();if(offset!==raw.length)return invalid();return result;
}
type Bucket={last:number;bootstrapMinute:number[];bootstrapHour:number[];resumeMinute:number[]};
export class SandboxAdmissionRate{
 private readonly buckets=new Map<string,Bucket>();private readonly global:Bucket={last:0,bootstrapMinute:[],bootstrapHour:[],resumeMinute:[]};private last=-1;
 constructor(private readonly key:Buffer,private readonly clock:()=>number=Date.now){}
 admit(operation:'bootstrap'|'resume',source:string){const now=this.clock();if(!Number.isSafeInteger(now)||now<0||now<this.last)return false;this.last=now;const hash=createHmac('sha256',this.key).update('st250-source-v1\0').update(source).digest('hex');for(const [key,bucket] of this.buckets)if(now-bucket.last>=600000&&bucket.bootstrapHour.every(time=>now-time>=3600000))this.buckets.delete(key);
  let bucket=this.buckets.get(hash);if(!bucket){if(this.buckets.size>=1024)return false;bucket={last:now,bootstrapMinute:[],bootstrapHour:[],resumeMinute:[]};this.buckets.set(hash,bucket);}bucket.last=now;
  for(const value of [bucket,this.global]){value.bootstrapMinute=value.bootstrapMinute.filter(t=>now-t<60000);value.bootstrapHour=value.bootstrapHour.filter(t=>now-t<3600000);value.resumeMinute=value.resumeMinute.filter(t=>now-t<60000);}
  if(operation==='bootstrap'){if(bucket.bootstrapMinute.length>=5||bucket.bootstrapHour.length>=20||this.global.bootstrapMinute.length>=20||this.global.bootstrapHour.length>=200)return false;for(const value of [bucket,this.global]){value.bootstrapMinute.push(now);value.bootstrapHour.push(now);}}
  else{if(bucket.resumeMinute.length>=20||this.global.resumeMinute.length>=100)return false;bucket.resumeMinute.push(now);this.global.resumeMinute.push(now);}return true;
 }
}
const HEADERS=new Set(['host','accept','accept-encoding','connection','user-agent','content-type','content-length','authorization','idempotency-key','x-subtrack-sandbox-gateway','x-subtrack-sandbox-source']);
export function sandboxHeaders(request:IncomingMessage,gate:Buffer){const headers:Record<string,string>={};if(request.method!=='POST'||!Object.values(wire.SANDBOX_MOBILE_PATHS).includes(request.url as typeof wire.SANDBOX_MOBILE_PATHS.bootstrap))return invalid();
 if(request.rawHeaders.length>32)return invalid();for(let i=0;i<request.rawHeaders.length;i+=2){const name=request.rawHeaders[i]!.toLowerCase(),value=request.rawHeaders[i+1];if(!HEADERS.has(name)||Object.hasOwn(headers,name)||typeof value!=='string'||value.length>4096||/[\p{Cc}]/u.test(value))return invalid();headers[name]=value;}
 const gateway=headers['x-subtrack-sandbox-gateway'];if(headers.host!=='198.44.116.159'||typeof gateway!=='string'||!/^[a-f0-9]{64}$/.test(gateway)||gate.length!==32||!timingSafeEqual(Buffer.from(gateway,'hex'),gate)||!isIP(headers['x-subtrack-sandbox-source']??''))return invalid();return headers;
}
export function createSandboxHttp(authority:SandboxAuthority,sessions:SandboxSession){const business=createPrivateMobileBusiness(authority),bank=createSandboxBankBusiness(authority),household=createSandboxHouseholdBusiness(authority),rates=new SandboxAdmissionRate(authority.config.rateKey);let active=0;
 function json(response:ServerResponse,status:number,value?:object){if(response.destroyed)return;response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');if(value===undefined){response.writeHead(status);response.end();return;}const raw=JSON.stringify(value);if(Buffer.byteLength(raw)>131072)throw new SandboxError('unavailable');response.setHeader('Content-Type',status>=400?'application/problem+json':'application/json');response.writeHead(status);response.end(raw);}
 function problem(response:ServerResponse,status:number,code:string){json(response,status,{type:'about:blank',title:'Sandbox request unavailable',status,code});}
 return Object.freeze({async handle(request:IncomingMessage,response:ServerResponse){let entered=false;let deadline:NodeJS.Timeout|undefined;
  try{if(active>=8){problem(response,429,'SANDBOX_CAPACITY_EXHAUSTED');return;}active++;entered=true;deadline=setTimeout(()=>{request.destroy();response.destroy();},10000);const headers=sandboxHeaders(request,authority.config.gatewayKey),path=request.url!,refresh=path===wire.SANDBOX_MOBILE_PATHS.refresh;
   if(refresh?headers['content-type']!==undefined||headers['content-length']!==undefined&&headers['content-length']!=='0':headers['content-type']!=='application/json'||!/^([1-9][0-9]{0,3})$/.test(headers['content-length']??'')||Number(headers['content-length'])>8192)throw new Error('wire');
   const bytes:Buffer[]=[];let length=0;for await(const chunk of request){const b=Buffer.from(chunk as Uint8Array);length+=b.length;if(length>8192)throw new Error('wire');bytes.push(b);}if(length!==(refresh?0:Number(headers['content-length'])))throw new Error('wire');const body=refresh?undefined:parseSandboxJson(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(Buffer.concat(bytes)));
   const authorization=headers.authorization,key=headers['idempotency-key'];let value:object|undefined,status:number;
   if(path===wire.SANDBOX_MOBILE_PATHS.bootstrap){if(authorization!==undefined)throw new Error('wire');wire.parseSandboxRequestKey(key);wire.parseSandboxBootstrap(body);if(!rates.admit('bootstrap',headers['x-subtrack-sandbox-source']!)){problem(response,429,'SANDBOX_CAPACITY_EXHAUSTED');return;}value=await sessions.bootstrap(body,key!);status=201;}
   else if(path===wire.SANDBOX_MOBILE_PATHS.resume){wire.parseSandboxTransport(body);wire.parseSandboxRequestKey(key);if(!authorization?.startsWith('SandboxCapability '))throw new Error('wire');const capability=wire.parseSandboxSecret(authorization.slice(18),'capability');if(!rates.admit('resume',headers['x-subtrack-sandbox-source']!)){problem(response,429,'SANDBOX_CAPACITY_EXHAUSTED');return;}value=await sessions.resume(body,capability,key!);status=201;}
   else if(path===wire.SANDBOX_MOBILE_PATHS.refresh){wire.parseSandboxRequestKey(key);if(!authorization?.startsWith('SandboxRefresh '))throw new Error('wire');value=await sessions.refresh(wire.parseSandboxSecret(authorization.slice(15),'refresh'),key!);status=200;}
   else{if(!authorization?.startsWith('Bearer ')||authorization.length>4103)throw new Error('wire');const token=authorization.slice(7);
    if(path===wire.SANDBOX_MOBILE_PATHS.logout){wire.parseSandboxTransport(body);if(key!==undefined)throw new Error('wire');await sessions.logout(token);status=204;}
    else{const parsed=wire.parseSandboxBusiness(body),requiresKey=parsed.operation==='manual'||parsed.operation==='manual-edit'||parsed.operation==='subscription-edit'||['bank-connect','bank-sync','bank-disconnect','detection-scan','detection-confirm','detection-reject','detection-undo'].includes(parsed.operation);if(requiresKey)wire.parseSandboxRequestKey(key);else if(key!==undefined)throw new Error('wire');const result=await (parsed.operation.startsWith('bank-')||parsed.operation.startsWith('detection-')?bank.execute(token,parsed.operation,parsed.body,key):parsed.operation.startsWith('household-')||parsed.operation.startsWith('dependant-')?household.execute(token,parsed.operation as SandboxHouseholdOperation,parsed.body):business.execute(token,(parsed.operation==='subscription-edit'?'manual-edit':parsed.operation==='subscription-status'?'status':parsed.operation) as PrivateMobileBusinessOperation,parsed.body,key));if('code'in result){problem(response,result.status,result.code);return;}value=result.value;status=result.status;}
   }json(response,status,value);
  }catch(error){if(response.destroyed)return;if(response.headersSent){response.destroy();return;}if(error instanceof SandboxError){const status=error.kind==='denied'?401:error.kind==='capacity'?429:error.kind==='restart'?409:500;problem(response,status,error.kind==='denied'?'SANDBOX_AUTHENTICATION_REQUIRED':error.kind==='capacity'?'SANDBOX_CAPACITY_EXHAUSTED':error.kind==='restart'?'SANDBOX_RESTART_REQUIRED':'SANDBOX_UNAVAILABLE');}else problem(response,400,'INVALID_SANDBOX_REQUEST');}
  finally{if(deadline)clearTimeout(deadline);if(entered)active--;}
 }});
}
