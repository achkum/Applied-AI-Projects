import {Buffer} from 'node:buffer';
import {createHash,createPublicKey,randomBytes,publicEncrypt,createCipheriv,constants} from 'node:crypto';
import {PREINPUT_RECIPIENT_SHA256} from './private-runtime-maestro-metadata.mjs';

const MAGIC=Buffer.from('ST253IDR1\n');
const OAEP=Buffer.from('ST253_IOS_DRIVER_PREFLIGHT_LOG_V1\0');
const LIMIT=393216,HEADER_LIMIT=2048,FIXED_BYTES=12+384+16;
const FIELDS=['version','purpose','sourceHead','runId','attempt','udid','simulatorCustodySha256','commandSha256','exitCode','recipient'];
const reject=()=>{throw new Error('Private iOS driver diagnostic unavailable');};
function requireValue(value){if(!value)reject();}
function exactData(value){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype)return false;
 const descriptors=Object.getOwnPropertyDescriptors(value);
 return Reflect.ownKeys(descriptors).length===FIELDS.length&&FIELDS.every(key=>descriptors[key]?.enumerable===true&&Object.hasOwn(descriptors[key],'value'));
}
function aad(value){
 requireValue(exactData(value));
 requireValue(value.version===1&&value.purpose==='ios-driver-preflight'&&['sourceHead','runId','attempt','udid'].every(key=>typeof value[key]==='string')&&/^[a-f0-9]{40}$/.test(value.sourceHead)
  &&/^[1-9][0-9]{0,19}$/.test(value.runId)&&/^[1-9][0-9]{0,3}$/.test(value.attempt)
  &&/^[A-F0-9]{8}(?:-[A-F0-9]{4}){3}-[A-F0-9]{12}$/.test(value.udid)
  &&['simulatorCustodySha256','commandSha256'].every(key=>typeof value[key]==='string'&&/^[a-f0-9]{64}$/.test(value[key]))
  &&Number.isInteger(value.exitCode)&&value.exitCode>=1&&value.exitCode<=255&&value.recipient===PREINPUT_RECIPIENT_SHA256);
 const result=Buffer.from(JSON.stringify(Object.fromEntries(FIELDS.map(key=>[key,value[key]]))));
 requireValue(result.length>0&&result.length<=HEADER_LIMIT);return result;
}

/** Crypto only: the preflight caller must measure source, device, child and pre-app custody. */
export function sealIosDriverLog(payload,binding,recipientPem){
 requireValue(Buffer.isBuffer(payload)&&payload.length>0&&payload.length<=LIMIT);
 const header=aad(binding),recipient=createPublicKey(recipientPem);
 requireValue(recipient.asymmetricKeyType==='rsa'&&recipient.asymmetricKeyDetails.modulusLength===3072
  &&createHash('sha256').update(recipient.export({type:'spki',format:'der'})).digest('hex')===PREINPUT_RECIPIENT_SHA256);
 const key=randomBytes(32);
 try{
  const iv=randomBytes(12),wrapped=publicEncrypt({key:recipient,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256',oaepLabel:OAEP},key);
  requireValue(wrapped.length===384);
  const cipher=createCipheriv('aes-256-gcm',key,iv,{authTagLength:16});cipher.setAAD(header);
  const ciphertext=Buffer.concat([cipher.update(payload),cipher.final()]),length=Buffer.alloc(4);length.writeUInt32BE(header.length);
  return Buffer.concat([MAGIC,length,header,iv,wrapped,cipher.getAuthTag(),ciphertext]);
 }finally{key.fill(0);}
}

/** Envelope/AAD check only. The recipient must authenticate GCM when decrypting. */
export function validSealedIosDriverLog(bytes,binding){
 try{
  const expected=aad(binding);
  requireValue(Buffer.isBuffer(bytes)&&bytes.length>=14+expected.length+FIXED_BYTES+1&&bytes.length<=14+HEADER_LIMIT+FIXED_BYTES+LIMIT&&bytes.subarray(0,10).equals(MAGIC));
  const size=bytes.readUInt32BE(10);requireValue(size===expected.length&&size>0&&size<=HEADER_LIMIT);
  requireValue(bytes.subarray(14,14+size).equals(expected));
  const payloadBytes=bytes.length-14-size-FIXED_BYTES;requireValue(payloadBytes>0&&payloadBytes<=LIMIT);return true;
 }catch{return false;}
}
