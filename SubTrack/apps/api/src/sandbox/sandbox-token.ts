import {sign,verify,createPublicKey,type KeyObject} from 'node:crypto';
export type SandboxClaims=Readonly<{iss:'urn:subtrack:auth:v2:sandbox';aud:'urn:subtrack:api:v2:sandbox';sub:string;sid:string;iat:number;exp:number;ver:2}>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HEADER=Object.freeze({alg:'EdDSA',typ:'subtrack-sandbox-access+jwt',kid:'st250-sandbox-v1'});
const fail=():never=>{throw new Error('Sandbox credential rejected');};
const encode=(v:object)=>Buffer.from(JSON.stringify(v)).toString('base64url');
function decode(v:string):Record<string,unknown>{if(!/^[A-Za-z0-9_-]+$/.test(v))return fail();const bytes=Buffer.from(v,'base64url');if(bytes.toString('base64url')!==v)return fail();const text=bytes.toString('utf8'),value:unknown=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value)||JSON.stringify(value)!==text)return fail();return value as Record<string,unknown>;}
export class SandboxToken{
 constructor(private readonly privateKey:KeyObject,private readonly publicKey:KeyObject,private readonly clock:()=>number){if(privateKey.type!=='private'||privateKey.asymmetricKeyType!=='ed25519'||publicKey.type!=='public'||publicKey.asymmetricKeyType!=='ed25519'||typeof clock!=='function'||!createPublicKey(privateKey).export({type:'spki',format:'der'}).equals(publicKey.export({type:'spki',format:'der'})))fail();}
 private now():number{const ms=this.clock();if(!Number.isSafeInteger(ms)||ms<0)return fail();return Math.floor(ms/1000);}
 issue(owner:string,session:string,sessionExpires:number):string{
  if(!UUID.test(owner)||!UUID.test(session)||!Number.isSafeInteger(sessionExpires))return fail();const iat=this.now(),exp=Math.min(iat+900,Math.floor(sessionExpires/1000));if(exp<=iat)return fail();const payload:SandboxClaims={iss:'urn:subtrack:auth:v2:sandbox',aud:'urn:subtrack:api:v2:sandbox',sub:owner,sid:session,iat,exp,ver:2};const input=`${encode(HEADER)}.${encode(payload)}`;return `${input}.${sign(null,Buffer.from(input,'ascii'),this.privateKey).toString('base64url')}`;
 }
 verify(token:string):SandboxClaims{
  try{if(typeof token!=='string'||token.length>4096)return fail();const parts=token.split('.');if(parts.length!==3)return fail();const [h,p,s]=parts as [string,string,string],header=decode(h),claims=decode(p),signature=Buffer.from(s,'base64url');if(JSON.stringify(header)!==JSON.stringify(HEADER)||signature.length!==64||signature.toString('base64url')!==s||!verify(null,Buffer.from(`${h}.${p}`,'ascii'),this.publicKey,signature))return fail();
   const keys=['iss','aud','sub','sid','iat','exp','ver'];if(Object.keys(claims).length!==keys.length||keys.some(k=>!Object.hasOwn(claims,k))||claims.iss!=='urn:subtrack:auth:v2:sandbox'||claims.aud!=='urn:subtrack:api:v2:sandbox'||typeof claims.sub!=='string'||!UUID.test(claims.sub)||typeof claims.sid!=='string'||!UUID.test(claims.sid)||!Number.isSafeInteger(claims.iat)||!Number.isSafeInteger(claims.exp)||claims.ver!==2)return fail();
   const now=this.now(),iat=claims.iat as number,exp=claims.exp as number;if(iat<0||iat>now||exp<=iat||exp>iat+900||now>=exp)return fail();return Object.freeze(claims) as SandboxClaims;
  }catch{return fail();}
 }
}
