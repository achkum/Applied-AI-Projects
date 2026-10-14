import {generateKeyPairSync} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {derivePrivateMobileManifest,PRIVATE_MOBILE_FIXTURE_KEY_NAMES} from './private-mobile-manifest.js';
function bundle():Record<string,string>{
 const value:Record<string,string>={};PRIVATE_MOBILE_FIXTURE_KEY_NAMES.forEach((name,index)=>{value[name]=(index+1).toString(16).padStart(2,'0').repeat(32);});
 value.privateKey=generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'}).toString();return value;
}
describe('owned fixture canonical key manifest',()=>{
 it('is canonical across property ordering and stable copies',()=>{const value=bundle();const hash=derivePrivateMobileManifest(value);expect(hash).toMatch(/^[a-f0-9]{64}$/);expect(derivePrivateMobileManifest(Object.fromEntries(Object.entries(value).reverse()))).toBe(hash);expect(derivePrivateMobileManifest({...value})).toBe(hash);});
 it.each(PRIVATE_MOBILE_FIXTURE_KEY_NAMES)('binds distinct %s bytes',name=>{const value=bundle();expect(derivePrivateMobileManifest({...value,[name]:'fe'.repeat(32)})).not.toBe(derivePrivateMobileManifest(value));});
 it('binds Ed25519 public key, rejecting duplicate and noncanonical portfolios',()=>{const value=bundle();const next=bundle();expect(derivePrivateMobileManifest({...value,privateKey:next.privateKey})).not.toBe(derivePrivateMobileManifest(value));
  for(const changed of [{...value,person:value.otp},{...value,otp:'FF'.repeat(32)},{...value,otp:'ff'},{...value,otp:12},{...value,privateKey:12},{...value,extra:'unexpected'},Object.fromEntries(Object.entries(value).filter(([name])=>name!=='otp')),null,[],Object.create(null)])expect(()=>derivePrivateMobileManifest(changed)).toThrow();
  const rsa=generateKeyPairSync('rsa',{modulusLength:1024}).privateKey.export({type:'pkcs8',format:'pem'}).toString();expect(()=>derivePrivateMobileManifest({...value,privateKey:rsa})).toThrow();
 });
});
