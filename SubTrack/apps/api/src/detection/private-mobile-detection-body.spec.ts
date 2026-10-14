import {Readable} from 'node:stream';
import type {IncomingMessage} from 'node:http';
import {describe,it,expect} from 'vitest';
import {privateMobileDetectionBody} from './private-mobile-detection-body.js';
function request(body:string|Buffer,headers?:string[],declared?:string){const bytes=Buffer.from(body);return Object.assign(Readable.from([bytes]),{rawHeaders:headers??['content-type','application/json','content-length',declared??String(bytes.length)]}) as unknown as IncomingMessage;}
describe('strict flat detection body',()=>{
 it('accepts exact strings and empty object without scalar coercion',async()=>{expect(await privateMobileDetectionBody(request('{}'))).toEqual({});expect(await privateMobileDetectionBody(request('{"expectedRevision":"9223372036854775807"}'))).toEqual({expectedRevision:'9223372036854775807'});});
 it('rejects framing and byte uncertainty',async()=>{for(const r of [request('{}',[]),request('{}',undefined,'0'),request('{}',undefined,'8193'),request('{}',undefined,'02'),request('{}',['content-type','text/plain','content-length','2']),request('{}',['content-type','application/json','content-length','2','Content-Length','2']),request('{}',undefined,'3'),request(' '.repeat(8193)),request(Buffer.from([0xff,0xff]))])await expect(privateMobileDetectionBody(r)).rejects.toThrow('wire');});
 it('rejects duplicate decoded aliases/prototype members/nonstrings/trailing malformed JSON',async()=>{for(const text of ['{"a":"x","a":"y"}','{"a":"x","\\u0061":"y"}','{"__proto__":"x"}','{"constructor":"x"}','{"prototype":"x"}','{"a":null}','{"a":true}','{"a":false}','{"a":1}','{"a":{}}','{"a":[]}','{} {}','{"a":"x",}','{"a":"unterminated}','{"a":"\\q"}','[]'])await expect(privateMobileDetectionBody(request(text))).rejects.toThrow('wire');});
});
