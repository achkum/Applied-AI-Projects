export {safePrivateBankFailure} from './private-mobile-bank-diagnostics.js';
import {safePrivateBankFailure,privateBankFailureCategory} from './private-mobile-bank-diagnostics.js';
import {runPrivateMobileProof} from './private-mobile-proof.js';
import {runPrivateMobileBankProof} from './private-mobile-bank-proof.js';
import {runPrivateMobileDetectionProof,requireDetectionFlags} from './private-mobile-detection-proof.js';
import type {OwnedPrivateMobileConfig} from './private-mobile-owned-fixture.js';
type Stage='PARENT_SETUP'|'BANK_SETUP'|'DETECTION_SETUP'|'RECEIPT';
const stages=['PARENT_SETUP','BANK_SETUP','DETECTION_SETUP','RECEIPT'] as const;
const categories=['NODE_MODULE','ARGUMENT','PERMISSION','UNDEFINED_COLUMN','UNDEFINED_TABLE','FOREIGN_KEY','UNIQUE','CHECK','NOT_NULL','TYPE_MISMATCH','INVALID_INPUT','NUMERIC_RANGE','SERIALIZATION','DEADLOCK','ASSERTION','OTHER'] as const;
const staged=new RegExp(`^ST249_DETECTION_PROOF_FAILURE phase=(${stages.join('|')}) category=(${categories.join('|')})$`);
export function safePrivateDetectionFailure(value:unknown):value is string{
 return typeof value==='string'&&!/[\r\n]/.test(value)&&(safePrivateBankFailure(value)||/^ST244_PROOF_FAILURE phase=(START|ENROLL|PROFILE_MODE|ADD|NATIVE_EDIT_STATUS|ISOLATION|ROTATION_REUSE|LOGIN|RESTART|LOGOUT|UNCERTAINTY|KEY_TAMPER)$/.test(value)||/^ST249_DETECTION_PROOF_FAILURE phase=(START|OVERFLOW|SCAN|PARALLEL|COLLISION|UNMATCHED|REVIEW|RESTART|TIMING|TWO_OWNER|RLS|PURGE|EXPIRED_SESSION|MINIMAL|BASELINE|SETUP|UNKNOWN)$/.test(value)||staged.test(value));
}
/** Closed driver diagnostics only; no application authority or private error payload. */
export function privateDetectionStageFailure(stage:Stage,error:unknown):string{
 if(!stages.includes(stage))return 'ST249_DETECTION_PROOF_FAILURE phase=UNKNOWN';
 try{const descriptor=error instanceof Error?Object.getOwnPropertyDescriptor(error,'message'):undefined;if(descriptor&&'value'in descriptor&&safePrivateDetectionFailure(descriptor.value))return descriptor.value;}catch{/* Hostile error objects supply no message. */}
 let category:string=privateBankFailureCategory(error);
 try{const descriptor=error instanceof Error?Object.getOwnPropertyDescriptor(error,'code'):undefined;
  if(descriptor&&'value'in descriptor&&typeof descriptor.value==='string'){
   if(['MODULE_NOT_FOUND','ERR_MODULE_NOT_FOUND','ERR_REQUIRE_ESM','ERR_REQUIRE_ASYNC_MODULE'].includes(descriptor.value))category='NODE_MODULE';
   else if(descriptor.value==='ERR_INVALID_ARG_TYPE')category='ARGUMENT';
  }
 }catch{/* No accessor/proxy/code value is exposed. */}
 return `ST249_DETECTION_PROOF_FAILURE phase=${stage} category=${category}`;
}
async function checkedStage<T>(stage:Stage,work:()=>Promise<T>):Promise<T>{try{return await work();}catch(error){throw new Error(privateDetectionStageFailure(stage,error));}}
/** Baselines execute unchanged before detection; no acceptance receipt is emitted here. */
export async function runPrivateMobileDetectionIntegration(config:OwnedPrivateMobileConfig){
 const parent=await checkedStage('PARENT_SETUP',()=>runPrivateMobileProof(config));
 const bank=await checkedStage('BANK_SETUP',()=>runPrivateMobileBankProof(config));
 const detection=await checkedStage('DETECTION_SETUP',async()=>{const result=await runPrivateMobileDetectionProof(config);requireDetectionFlags(result.flags);return result;});
 if(parent.identityCount!==1||bank.identityCount!==2||bank.profileCompleteCount!==2||bank.justMeCount!==2||bank.subscriptionCount!==1)throw new Error('ST249_DETECTION_PROOF_FAILURE phase=BASELINE');
 // These seven are the unchanged parent's mandatory assertions, which returned only after all actual checks passed.
 const parentGates={apiRestartReadback:true,logoutBearerDenied:true,refreshReuseRevoked:true,ownerIsolation:true,uncertainMutationCredentialsWithheld:true,oldProofReplayDeniedBeforeAndAfterRestart:true,keyPortfolioDriftRejected:true};
 const bankGates={bankDedup:bank.dedup,bankRestart:bank.restart,bankRetainedReachable:bank.retainedReachable,bankPurged:bank.purged,bankImmutableReplay:bank.replay,bankOwnerIsolation:bank.ownerIsolation,bankManualPreserved:bank.manualPreserved,bankUncertaintyRollback:bank.uncertaintyRollback,bankLogoutDenied:bank.logoutDenied,bankDependencyRollback:bank.dependencyRollback,bankParallelConnect:bank.parallelConnect,bankExpiredSessionDenied:bank.expiredSessionDenied,bankTwoVerifiedOwners:bank.twoVerifiedOwners,bankRlsNegative:bank.rlsNegative};
 return Object.freeze({version:1,head:config.head,proof:'direct-tls-postgresql16',identityCount:detection.identityCount,profileCompleteCount:detection.profileCompleteCount,justMeCount:detection.justMeCount,manualSubscriptionCount:detection.manualSubscriptionCount,detectedSubscriptionCount:detection.detectedSubscriptionCount,...parentGates,...bankGates,...detection.flags});
}
