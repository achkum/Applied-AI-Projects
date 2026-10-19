import {afterEach,describe,it,expect,vi} from 'vitest';
import {createOwnedPrivateMobileHarness,type OwnedPrivateMobileConfig} from './private-mobile-owned-fixture.js';
const config:OwnedPrivateMobileConfig={version:1,head:'a'.repeat(40),marker:'b'.repeat(32),database:'st237_private_https_profile',host:'127.0.0.1',port:65432,
 ownerPassword:'fixture-placeholder',actorPassword:'fixture-placeholder',mode:'docker',containerId:'c'.repeat(64),clusterDir:null,tempDir:'C:/st248-owned-fixture-not-started',
 caPath:'C:/st248-owned-fixture-not-started/ca.pem',leafKeyPath:'C:/st248-owned-fixture-not-started/key.pem',leafChainPath:'C:/st248-owned-fixture-not-started/chain.pem',manifestHash:'d'.repeat(64),keyBundlePath:'C:/st248-owned-fixture-not-started/keys.json'};
afterEach(()=>vi.unstubAllEnvs());
describe('owned second verified principal proof guard',()=>{
 it('never issues a returning session before the qualified graph starts or after disposal',async()=>{
  vi.stubEnv('NODE_ENV','development');const harness=createOwnedPrivateMobileHarness(config);
  try{
   await expect(harness.secondOwnerSession()).rejects.toThrow('Fixture unavailable');
   await harness.dispose();await expect(harness.secondOwnerSession()).rejects.toThrow('Fixture unavailable');
  }finally{await harness.dispose();}
 });
 it('takes no actor, subject, owner, credential or body selector',async()=>{
  vi.stubEnv('NODE_ENV','development');const harness=createOwnedPrivateMobileHarness(config);
  try{
   for(const value of ['alice','bob',{identityId:'foreign'},undefined])await expect((harness.secondOwnerSession as unknown as (...args:unknown[])=>Promise<unknown>)(value)).rejects.toThrow('Fixture unavailable');
  }finally{await harness.dispose();}
 });
 it('requires a single canonical owner UUID for its closed private observer',async()=>{
  const harness=createOwnedPrivateMobileHarness(config);
  try{
   for(const value of ['', 'foreign', 'aaaaaaaa-aaaa-1aaa-8aaa-aaaaaaaaaaaa','AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'])await expect(harness.readbackBankOwnerReceipt(value)).rejects.toThrow('Fixture unavailable');
   await expect((harness.readbackBankOwnerReceipt as unknown as (...args:unknown[])=>Promise<unknown>)()).rejects.toThrow('Fixture unavailable');
   await expect((harness.readbackBankOwnerReceipt as unknown as (...args:unknown[])=>Promise<unknown>)('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','extra')).rejects.toThrow('Fixture unavailable');
   await harness.dispose();await expect(harness.readbackBankOwnerReceipt('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).rejects.toThrow('Fixture unavailable');
  }finally{await harness.dispose();}
 });
});
