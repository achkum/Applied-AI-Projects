import type {IncomingMessage} from 'node:http';
import {privateBody,rawHeader} from '../auth/enrollment-v2/private-enrollment-http.js';
/** Detection alone admits flat string values; shared enrollment/bank framing stays unchanged. */
export async function privateMobileDetectionBody(request:IncomingMessage):Promise<Record<string,unknown>>{
 const length=rawHeader(request,'content-length');if(length===null||!/^[1-9][0-9]{0,3}$/.test(length)||Number(length)>8192||rawHeader(request,'content-type')!=='application/json')throw new Error('wire');
 let body:Record<string,unknown>;try{body=await privateBody(request);}catch{throw new Error('wire');}
 if(Reflect.ownKeys(body).some(k=>typeof k!=='string'||['__proto__','constructor','prototype'].includes(k)||typeof body[k]!=='string'))throw new Error('wire');return body;
}
