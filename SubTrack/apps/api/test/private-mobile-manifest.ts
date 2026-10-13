import {createHash,createPrivateKey,createPublicKey} from 'node:crypto';
export const PRIVATE_MOBILE_FIXTURE_KEY_NAMES=['otp','rate','idempotency','anonymous','subject','person','simulator','credential'] as const;
/** One canonical fixture manifest algorithm used by provisioning and every graph start. */
export function derivePrivateMobileManifest(value:unknown):string{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw new Error('Fixture key bundle rejected');
 const record=value as Record<string,unknown>;const names=Object.keys(record);
 if(names.length!==9||names.some(name=>![...PRIVATE_MOBILE_FIXTURE_KEY_NAMES,'privateKey'].includes(name)))throw new Error('Fixture key bundle rejected');
 const keys=PRIVATE_MOBILE_FIXTURE_KEY_NAMES.map(name=>{const key=record[name];if(typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key))throw new Error('Fixture key bundle rejected');return [name,key];});
 if(new Set(keys.map(pair=>pair[1])).size!==8||typeof record.privateKey!=='string')throw new Error('Fixture key bundle rejected');
 const privateKey=createPrivateKey(record.privateKey);if(privateKey.asymmetricKeyType!=='ed25519')throw new Error('Fixture key bundle rejected');
 const publicKey=createPublicKey(privateKey).export({format:'der',type:'spki'}).toString('hex');
 return createHash('sha256').update('subtrack:st244:fixture-manifest:v1\0').update(JSON.stringify({version:1,epoch:'st244-mobile-private-v1',keys,publicKey})).digest('hex');
}
