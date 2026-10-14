import {describe,it,expect} from 'vitest';
import {generateKeyPairSync,sign,createPublicKey} from 'node:crypto';
import {SandboxToken} from './sandbox-token.js';
const owner=['123e4567','e89b','42d3','a456','426614174000'].join('-'),session=['123e4567','e89b','42d3','a456','426614174001'].join('-');
const keys=generateKeyPairSync('ed25519');
function signed(header:unknown,claims:unknown){const h=Buffer.from(JSON.stringify(header)).toString('base64url'),p=Buffer.from(JSON.stringify(claims)).toString('base64url'),input=`${h}.${p}`;return `${input}.${sign(null,Buffer.from(input),keys.privateKey).toString('base64url')}`;}
describe('separate sandbox signing namespace',()=>{
 it('caps access at15minutes or earlier durable expiry and rejects equality expiry',()=>{let now=1000000;const tokens=new SandboxToken(keys.privateKey,keys.publicKey,()=>now);const full=tokens.issue(owner,session,now+86400000),short=tokens.issue(owner,session,now+60000);expect(tokens.verify(full).exp-tokens.verify(full).iat).toBe(900);expect(tokens.verify(short).exp-tokens.verify(short).iat).toBe(60);now+=60000;expect(()=>tokens.verify(short)).toThrow();expect(tokens.verify(full).sub).toBe(owner);});
 it('rejects wrong signing material/config and invalid duration/identifier/clock',()=>{
  const other=generateKeyPairSync('ed25519'),ec=generateKeyPairSync('ec',{namedCurve:'prime256v1'});for(const [priv,pub] of [[keys.publicKey,keys.publicKey],[ec.privateKey,ec.publicKey],[keys.privateKey,keys.privateKey],[keys.privateKey,other.publicKey]])expect(()=>new SandboxToken(priv!,pub!,()=>1000000)).toThrow();expect(()=>new SandboxToken(keys.privateKey,keys.publicKey,null as unknown as ()=>number)).toThrow();const tokens=new SandboxToken(keys.privateKey,keys.publicKey,()=>1000000);for(const args of [['bad',session,1001000],[owner,'bad',1001000],[owner,session,NaN],[owner,session,1000000]] as const)expect(()=>tokens.issue(args[0],args[1],args[2])).toThrow();for(const now of [-1,1.5])expect(()=>new SandboxToken(keys.privateKey,keys.publicKey,()=>now).issue(owner,session,2000000)).toThrow();
 });
 it('rejects private/production/header/claim/signature namespaces and hostile shape',()=>{
  const tokens=new SandboxToken(keys.privateKey,keys.publicKey,()=>1000000),valid=tokens.issue(owner,session,2000000),parts=valid.split('.'),header=JSON.parse(Buffer.from(parts[0]!,'base64url').toString()),claims=JSON.parse(Buffer.from(parts[1]!,'base64url').toString());
  for(const body of [{...claims,iss:'urn:subtrack:auth:v2:development'},{...claims,aud:'production'},{...claims,sub:1},{...claims,sub:'invalid'},{...claims,sid:1},{...claims,sid:'invalid'},{...claims,iat:1.5},{...claims,exp:'1900'},{...claims,ver:1},{...claims,iat:-1},{...claims,iat:1001},{...claims,exp:1000},{...claims,exp:1901},{...claims,owner:owner},Object.fromEntries(Object.entries(claims).filter(([key])=>key!=='ver'))])expect(()=>tokens.verify(signed(header,body))).toThrow();
  for(const h of [{...header,kid:'private'},{...header,typ:'subtrack-v2-access+jwt'}])expect(()=>tokens.verify(signed(h,claims))).toThrow();
  for(const value of [null,'a'.repeat(4097),'one.two','!.two.three',`AB.${parts[1]}.${parts[2]}`,`${Buffer.from('[]').toString('base64url')}.${parts[1]}.${parts[2]}`,`${Buffer.from(' {"alg":"EdDSA"} ').toString('base64url')}.${parts[1]}.${parts[2]}`,`${parts[0]}.${parts[1]}.A`,`${parts[0]}.${parts[1]}.${Buffer.alloc(64).toString('base64url')}`])expect(()=>tokens.verify(value as string)).toThrow();
  const badPublic=createPublicKey(generateKeyPairSync('ed25519').privateKey);expect(()=>new SandboxToken(keys.privateKey,badPublic,()=>1000000)).toThrow();
 });
});
