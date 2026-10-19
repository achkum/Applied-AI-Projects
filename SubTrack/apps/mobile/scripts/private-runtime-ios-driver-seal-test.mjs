import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import crypto from 'node:crypto';
import {readFileSync} from 'node:fs';
import {URL} from 'node:url';
import {syncBuiltinESMExports} from 'node:module';
import {PREINPUT_RECIPIENT_SHA256} from './private-runtime-maestro-metadata.mjs';
import {sealIosDriverLog,validSealedIosDriverLog} from './private-runtime-ios-driver-seal.mjs';

const pem=readFileSync(new URL('../../../.sdlc/evidence/ST-253/native-diagnostic-recipient.pem',import.meta.url));
const binding={version:1,purpose:'ios-driver-preflight',sourceHead:'a'.repeat(40),runId:'123',attempt:'1',udid:'123E4567-E89B-42D3-A456-426614174000',simulatorCustodySha256:'b'.repeat(64),commandSha256:'c'.repeat(64),exitCode:1,recipient:PREINPUT_RECIPIENT_SHA256};
const payload=Buffer.from(JSON.stringify({process:Buffer.from('Synthetic startup diagnostic').toString('base64'),maestro:'',runner:''}));

test('pinned RSA envelope encrypts bounded opaque bytes with a distinct canonical purpose and fresh randomness',()=>{
 const first=sealIosDriverLog(payload,binding,pem),second=sealIosDriverLog(payload,binding,pem);
 assert.equal(first.subarray(0,10).toString(),'ST253IDR1\n');assert.equal(validSealedIosDriverLog(first,binding),true);assert.notDeepEqual(first,second);
 const size=first.readUInt32BE(10),header=JSON.parse(first.subarray(14,14+size));
 assert.deepEqual(Object.keys(header),Object.keys(binding));assert.deepEqual(header,binding);
 assert.equal(first.includes(payload),false);assert.equal(validSealedIosDriverLog(sealIosDriverLog(Buffer.alloc(393216,3),binding,pem),binding),true);
});

test('actual AES-GCM roundtrip authenticates payload/AAD and rejects altered ciphertext without any private recipient key',()=>{
 // Observe only this test's ephemeral AES material, then wrap it with the actual pinned public key.
 const original=crypto.publicEncrypt,keys=[],references=[];
 mock.method(crypto,'publicEncrypt',(options,key)=>{assert.equal(options.oaepHash,'sha256');assert.equal(options.oaepLabel.toString(),'ST253_IOS_DRIVER_PREFLIGHT_LOG_V1\0');references.push(key);keys.push(Buffer.from(key));return original(options,key);});syncBuiltinESMExports();
 try{
  const sealed=sealIosDriverLog(payload,binding,pem),size=sealed.readUInt32BE(10),start=14+size;
  assert.equal(references[0].every(byte=>byte===0),true);
  const decrypt=bytes=>{const cipher=crypto.createDecipheriv('aes-256-gcm',keys[0],bytes.subarray(start,start+12),{authTagLength:16});cipher.setAAD(bytes.subarray(14,start));cipher.setAuthTag(bytes.subarray(start+396,start+412));return Buffer.concat([cipher.update(bytes.subarray(start+412)),cipher.final()]);};
  assert.deepEqual(decrypt(sealed),payload);
  for(const at of [20,start,start+396,sealed.length-1]){const altered=Buffer.from(sealed);altered[at]^=1;assert.throws(()=>decrypt(altered));}
 }finally{for(const key of keys)key.fill(0);mock.restoreAll();syncBuiltinESMExports();}
});

test('closed binding and payload limits reject every foreign context, wrong purpose, malformed envelope and recipient',()=>{
 for(const patch of [{version:2},{purpose:'ios-preinput'},{sourceHead:'A'.repeat(40)},{runId:'0'},{runId:123},{attempt:'01'},{attempt:1},{udid:binding.udid.toLowerCase()},{simulatorCustodySha256:'foreign'},{commandSha256:'foreign'},{exitCode:0},{exitCode:256},{exitCode:1.5},{recipient:'0'.repeat(64)},{extra:true}])assert.throws(()=>sealIosDriverLog(payload,{...binding,...patch},pem));
 for(const value of [null,{},Buffer.alloc(0),Buffer.alloc(393217)])assert.throws(()=>sealIosDriverLog(value,binding,pem));
 const accessor={...binding};Object.defineProperty(accessor,'sourceHead',{enumerable:true,get(){throw Error('Accessor must not execute');}});assert.throws(()=>sealIosDriverLog(payload,accessor,pem));
 const foreign=crypto.generateKeyPairSync('rsa',{modulusLength:3072}).publicKey.export({type:'spki',format:'pem'});assert.throws(()=>sealIosDriverLog(payload,binding,foreign));assert.throws(()=>sealIosDriverLog(payload,binding,'invalid key'));
 const sealed=sealIosDriverLog(payload,binding,pem);
 for(const value of [null,Buffer.alloc(0),sealed.subarray(0,sealed.length-payload.length),Buffer.concat([sealed,Buffer.alloc(393217)])])assert.equal(validSealedIosDriverLog(value,binding),false);
 for(const field of ['sourceHead','runId','attempt','udid','simulatorCustodySha256','commandSha256','exitCode']){const foreignBinding={...binding,[field]:field==='exitCode'?2:field==='runId'?'124':field==='attempt'?'2':field==='udid'?'223E4567-E89B-42D3-A456-426614174000':'d'.repeat(field==='sourceHead'?40:64)};assert.equal(validSealedIosDriverLog(sealed,foreignBinding),false);}
 for(const at of [0,10,14]){const changed=Buffer.from(sealed);changed[at]^=1;assert.equal(validSealedIosDriverLog(changed,binding),false);}
 assert.equal(validSealedIosDriverLog(sealed,{...binding,purpose:'ios-preinput'}),false);
});


test('ephemeral AES material is zeroed if RSA wrapping throws',()=>{
 let reference;mock.method(crypto,'publicEncrypt',(_options,key)=>{reference=key;throw Error('Synthetic wrapping failure');});syncBuiltinESMExports();
 try{assert.throws(()=>sealIosDriverLog(payload,binding,pem));assert.equal(reference.length,32);assert.equal(reference.every(byte=>byte===0),true);}
 finally{mock.restoreAll();syncBuiltinESMExports();}
});
