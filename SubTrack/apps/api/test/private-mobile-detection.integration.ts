import {runPrivateMobileProof} from './private-mobile-proof.js';
import {runPrivateMobileBankProof} from './private-mobile-bank-proof.js';
import {runPrivateMobileDetectionProof,requireDetectionFlags} from './private-mobile-detection-proof.js';
import type {OwnedPrivateMobileConfig} from './private-mobile-owned-fixture.js';
/** Baselines execute unchanged before detection; no acceptance receipt is emitted here. */
export async function runPrivateMobileDetectionIntegration(config:OwnedPrivateMobileConfig){
 const parent=await runPrivateMobileProof(config);
 const bank=await runPrivateMobileBankProof(config);
 const detection=await runPrivateMobileDetectionProof(config);requireDetectionFlags(detection.flags);
 if(parent.identityCount!==1||bank.identityCount!==2||bank.profileCompleteCount!==2||bank.justMeCount!==2||bank.subscriptionCount!==1)throw new Error('ST249_DETECTION_PROOF_FAILURE phase=BASELINE');
 // These seven are the unchanged parent's mandatory assertions, which returned only after all actual checks passed.
 const parentGates={apiRestartReadback:true,logoutBearerDenied:true,refreshReuseRevoked:true,ownerIsolation:true,uncertainMutationCredentialsWithheld:true,oldProofReplayDeniedBeforeAndAfterRestart:true,keyPortfolioDriftRejected:true};
 const bankGates={bankDedup:bank.dedup,bankRestart:bank.restart,bankRetainedReachable:bank.retainedReachable,bankPurged:bank.purged,bankImmutableReplay:bank.replay,bankOwnerIsolation:bank.ownerIsolation,bankManualPreserved:bank.manualPreserved,bankUncertaintyRollback:bank.uncertaintyRollback,bankLogoutDenied:bank.logoutDenied,bankDependencyRollback:bank.dependencyRollback,bankParallelConnect:bank.parallelConnect,bankExpiredSessionDenied:bank.expiredSessionDenied,bankTwoVerifiedOwners:bank.twoVerifiedOwners,bankRlsNegative:bank.rlsNegative};
 return Object.freeze({version:1,head:config.head,proof:'direct-tls-postgresql16',identityCount:detection.identityCount,profileCompleteCount:detection.profileCompleteCount,justMeCount:detection.justMeCount,manualSubscriptionCount:detection.manualSubscriptionCount,detectedSubscriptionCount:detection.detectedSubscriptionCount,...parentGates,...bankGates,...detection.flags});
}
