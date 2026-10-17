import type {IncomingMessage} from 'node:http';
import {rawHeader} from '../auth/enrollment-v2/private-enrollment-http.js';
const invalid=():never=>{throw new Error('wire');};
/** Bank-only flat JSON framing. The reviewed disconnect contract alone adds a literal purge boolean. */
export async function privateMobileBankBody(request:IncomingMessage):Promise<Record<string,unknown>>{
 const declared=rawHeader(request,'content-length');
 if(declared===null||!/^[1-9][0-9]{0,3}$/.test(declared)||Number(declared)>8192||rawHeader(request,'content-type')!=='application/json')return invalid();
 const chunks:Buffer[]=[];let length=0;
 for await(const chunk of request){const bytes=Buffer.from(chunk as Uint8Array);length+=bytes.length;if(length>8192)return invalid();chunks.push(bytes);}
 if(length!==Number(declared))return invalid();
 let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));}catch{return invalid();}
 let i=0;const skip=()=>{while(i<text.length&&/[ \t\r\n]/.test(text[i]!))i++;};
 const string=():string=>{
  if(text[i]!=='"')return invalid();const start=i++;
  while(i<text.length){
   if(text[i]==='\\'){i+=2;continue;}
   if(text[i++]==='"'){try{return JSON.parse(text.slice(start,i)) as string;}catch{return invalid();}}
  }
  return invalid();
 };
 skip();if(text[i++]!=='{')return invalid();skip();
 const body:Record<string,unknown>=Object.create(null) as Record<string,unknown>;
 if(text[i]!=='}')while(true){
  const key=string();if(Object.hasOwn(body,key)||['__proto__','constructor','prototype'].includes(key))return invalid();skip();
  if(text[i++]!==':')return invalid();skip();
  if(text[i]==='"')body[key]=string();
  else if(text.slice(i,i+4)==='null'){body[key]=null;i+=4;}
  else if(key==='purge'&&text.slice(i,i+4)==='true'){body[key]=true;i+=4;}
  else if(key==='purge'&&text.slice(i,i+5)==='false'){body[key]=false;i+=5;}
  else return invalid();
  skip();if(text[i]==='}')break;if(text[i++]!==',')return invalid();skip();
 }
 // Empty-object admission or the loop break has already proved the closing brace.
 i++;skip();if(i!==text.length)return invalid();
 return body;
}
