import {createPrivateKey,createPublicKey,createHash,type KeyObject} from 'node:crypto';
import {lstat,realpath,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
export const SANDBOX_ORIGIN='https://198.44.116.159';
export const SANDBOX_EPOCH='st250-sandbox-v1';
export type SandboxConfig=Readonly<{database:Readonly<{host:'database';database:'subtrack_sandbox';user:'subtrack_sandbox_api_login';password:string;max:4;connectionTimeoutMillis:3000;idleTimeoutMillis:5000}>;privateKey:KeyObject;publicKey:KeyObject;capabilityKey:Buffer;refreshKey:Buffer;admissionKey:Buffer;rateKey:Buffer;gatewayKey:Buffer;manifest:string;migrationHashes:readonly string[]}>;
const fail=():never=>{throw new Error('Sandbox configuration unavailable');};
function own(value:unknown,keys:readonly string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype)return fail();const d=Object.getOwnPropertyDescriptors(value);if(Reflect.ownKeys(value).length!==keys.length||keys.some(k=>!d[k]||!('value'in d[k])))return fail();return value as Record<string,unknown>;}
async function secret(path:unknown):Promise<unknown>{if(typeof path!=='string'||!['/run/secrets/database_runtime','/run/secrets/api_auth_material'].includes(path))return fail();const stat=await lstat(path);if(!stat.isFile()||(stat.mode&0o077)!==0||stat.size<1||stat.size>16384||await realpath(path)!==path)return fail();return JSON.parse(await readFile(path,'utf8'));}
export function createSandboxConfig(environment:Readonly<Record<string,string|undefined>>,credential:unknown,material:unknown,migrationHashes:readonly string[]):SandboxConfig{
 if(environment.NODE_ENV!=='production'||environment.SUBTRACK_RUNTIME!=='sandbox'||environment.SANDBOX_STARTUP_ENABLED!=='true'||environment.SANDBOX_PUBLICATION_ENABLED!=='true'||environment.SANDBOX_DATABASE_HOST!=='database'||environment.SANDBOX_DATABASE_NAME!=='subtrack_sandbox'||environment.SANDBOX_DATABASE_ROLE!=='subtrack_sandbox_runtime'||environment.SANDBOX_POOL_MAX!=='4'||environment.PORT!=='4000')return fail();
 const c=own(credential,['username','password']),m=own(material,['privateKeyPem','capabilityKey','refreshKey','admissionKey','rateKey','gatewayKey']);
 if(c.username!=='subtrack_sandbox_api_login'||typeof c.password!=='string'||c.password.length<32||c.password.length>128||/[\s\p{Cc}]/u.test(c.password)||typeof m.privateKeyPem!=='string'||m.privateKeyPem.length>4096||migrationHashes.length!==2||migrationHashes.some(h=>!/^[a-f0-9]{64}$/.test(h)))return fail();
 const names=['capabilityKey','refreshKey','admissionKey','rateKey','gatewayKey'],values=names.map(name=>{const v=m[name];if(typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))return fail();return Buffer.from(v,'hex');});
 if(new Set(values.map(v=>v.toString('hex'))).size!==5)return fail();const privateKey=createPrivateKey(m.privateKeyPem);if(privateKey.type!=='private'||privateKey.asymmetricKeyType!=='ed25519')return fail();const publicKey=createPublicKey(privateKey);
 const manifest=createHash('sha256').update('st250-manifest-v1\0').update(publicKey.export({type:'spki',format:'der'}));for(const value of values)manifest.update(value);for(const hash of migrationHashes)manifest.update(hash);
 return Object.freeze({database:Object.freeze({host:'database',database:'subtrack_sandbox',user:'subtrack_sandbox_api_login',password:c.password,max:4,connectionTimeoutMillis:3000,idleTimeoutMillis:5000}),privateKey,publicKey,capabilityKey:values[0]!,refreshKey:values[1]!,admissionKey:values[2]!,rateKey:values[3]!,gatewayKey:values[4]!,manifest:manifest.digest('hex'),migrationHashes:Object.freeze([...migrationHashes])});
}
export async function loadSandboxConfig(environment:NodeJS.ProcessEnv):Promise<SandboxConfig>{
 const credential=await secret(environment.SANDBOX_DATABASE_CREDENTIAL_FILE),material=await secret(environment.SANDBOX_AUTH_MATERIAL_FILE),hashes=[];
 for(const name of ['001-sandbox-foundation.sql','002-sandbox-mobile-business.sql'])hashes.push(createHash('sha256').update(await readFile(resolve(__dirname,'../../prisma/sandbox',name))).digest('hex'));
 return createSandboxConfig(environment,credential,material,hashes);
}
