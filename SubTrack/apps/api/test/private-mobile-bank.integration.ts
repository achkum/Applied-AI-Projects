export {safePrivateBankFailure} from './private-mobile-bank-diagnostics.js';
import {runPrivateMobileProof} from './private-mobile-proof.js';
import {runPrivateMobileBankProof} from './private-mobile-bank-proof.js';
import type {OwnedPrivateMobileConfig} from './private-mobile-owned-fixture.js';
export async function runPrivateMobileBankIntegration(config:OwnedPrivateMobileConfig){
 const parent=await runPrivateMobileProof(config);
 const bank=await runPrivateMobileBankProof(config);
 return Object.freeze({...parent,...bank});
}
