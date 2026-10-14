import {Readable} from 'node:stream';
import type {IncomingMessage} from 'node:http';
import {describe,it,expect} from 'vitest';
import {privateMobileBankBody} from './private-mobile-bank-body.js';
import {privateBody} from '../auth/enrollment-v2/private-enrollment-http.js';
function request(text:string|Buffer,headers?:string[]):IncomingMessage{
 const bytes=typeof text==='string'?Buffer.from(text):text;
 return Object.assign(Readable.from([bytes.subarray(0,1),bytes.subarray(1)]),{rawHeaders:headers??['Content-Type','application/json','Content-Length',String(bytes.length)]}) as unknown as IncomingMessage;
}
describe('reviewed bank-only literal boolean framing',()=>{
 it('accepts the reviewed literals, strings/null and whitespace without changing shared enrollment framing',async()=>{
  for(const purge of [false,true]){
   const raw=JSON.stringify({connectionId:'fixture-connection',purge});expect(await privateMobileBankBody(request(raw))).toEqual({connectionId:'fixture-connection',purge});
   // This reproduces the actual failed request's cause; the shared parser remains intentionally unchanged.
   await expect(privateBody(request(raw))).rejects.toThrow('wire');
  }
  expect(await privateMobileBankBody(request(' \n{ "institutionId" : "synthetic-demo-v1" }\t'))).toEqual({institutionId:'synthetic-demo-v1'});
  expect(await privateMobileBankBody(request('{}'))).toEqual({});
  expect(await privateMobileBankBody(request(JSON.stringify({purge:null,description:'quoted"value'})))).toEqual({purge:null,description:'quoted"value'});
  expect(await privateMobileBankBody(request('{"pu\\u0072ge":true}'))).toEqual({purge:true});
 });
 it('rejects duplicate decoded aliases, prototype keys, nonflat values and malformed tokens',async()=>{
  for(const raw of [
   '{"purge":true,"purge":false}','{"purge":true,"pu\\u0072ge":false}',
   '{"__proto__":"fixture"}','{"constructor":"fixture"}','{"prototype":"fixture"}','{"__pro\\u0074o__":"fixture"}',
   '{"connectionId":true}','{"institutionId":false}','{"other":true}','{"purge":0}','{"purge":[]}','{"purge":{}}',
   '[]','null','{"purge"true}','{"purge":truth}','{"purge":falseX}','{"purge":true "other":"x"}',
   '{"purge":true,}','{"purge":true','{"purge":true} trailing','{"purge":true}{}',
   '{purge:true}','{"unterminated','{"purge":"unterminated}','{"purge":"escape\\','{"purge":"bad\\q"}',
  ])await expect(privateMobileBankBody(request(raw))).rejects.toThrow('wire');
 });
 it('requires fatal UTF8, exact byte length/type and the existing8192 bound',async()=>{
  await expect(privateMobileBankBody(request(Buffer.from([0xc3,0x28])))).rejects.toThrow('wire');
  for(const headers of [[],['Content-Type','application/json'],['Content-Type','application/json','Content-Length','0'],['Content-Type','application/json','Content-Length','02'],['Content-Type','application/json','Content-Length','9999'],['Content-Type','application/json','Content-Length','3'],['Content-Length','2'],['Content-Type','text/plain','Content-Length','2'],['Content-Type','application/json','Content-Length','2','Content-Length','2']])await expect(privateMobileBankBody(request('{}',headers))).rejects.toThrow('wire');
  await expect(privateMobileBankBody(request(Buffer.alloc(8193,32),['Content-Type','application/json','Content-Length','8192']))).rejects.toThrow('wire');
 });
});
