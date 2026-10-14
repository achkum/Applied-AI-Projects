import assert from 'node:assert/strict';
import {request} from 'node:https';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {createOwnedPrivateMobileHarness,type OwnedPrivateMobileConfig} from './private-mobile-owned-fixture.js';
import {PRIVATE_DETECTION_FLAGS,type PrivateDetectionFlag} from './private-mobile-detection-receipt.js';
import {OWNED_DETECTION_SCENARIOS,OWNED_DETECTION_BOUNDARIES,type OwnedDetectionScenario} from './private-mobile-owned-fixture-observer.js';
import {PRIVATE_MOBILE_PATHS as paths,parsePrivateMobileSessionResponse} from '@subtrack/contracts/private-mobile';
import {PRIVATE_MOBILE_BANK_PATHS as bank,parsePrivateMobileBankMutationResult} from '@subtrack/contracts/private-mobile-bank';
import {PRIVATE_MOBILE_DETECTION_PATHS as detection,parsePrivateMobileDetectionReadResult,parsePrivateMobileDetectionReviewResult} from '@subtrack/contracts/private-mobile-detection';

async function setup(config:OwnedPrivateMobileConfig){
 const harness=createOwnedPrivateMobileHarness(config),ca=await readFile(config.caPath);
 try{await harness.enableDetectionQualification();await harness.start();}catch(error){await harness.dispose();throw error;}
 async function post(path:string,body:object,status:number,headers:Record<string,string>={}){
  const raw=JSON.stringify(body),result=await new Promise<{status:number;body:string;cache:unknown}>((ok,no)=>{
   const req=request({hostname:'127.0.0.1',port:3443,servername:'localhost',path,method:'POST',ca,headers:{Host:'localhost:3443','Content-Type':'application/json','Content-Length':String(Buffer.byteLength(raw)),...headers}},res=>{
    const chunks:Buffer[]=[];let size=0;res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>131072){res.destroy();no(new Error('Owned detection bound'));}else chunks.push(chunk);});res.on('error',no);res.on('end',()=>ok({status:res.statusCode!,body:Buffer.concat(chunks).toString('utf8'),cache:res.headers['cache-control']}));
   });req.setTimeout(15000,()=>req.destroy(new Error('Owned detection deadline')));req.on('error',no);req.end(raw);
  });assert.equal(result.status,status);assert.equal(result.cache,'no-store');return result.body?JSON.parse(result.body) as Record<string,unknown>:{};
 }
 const key=()=>({'Idempotency-Key':randomUUID()});
 async function login(){const verified=await post(paths.verifyLogin,{transport:'mobile'},200,key());const session=parsePrivateMobileSessionResponse(await post(paths.session,{transport:'mobile',loginProof:verified.loginProof},201,key()));return {Authorization:`Bearer ${session.accessToken}`};}
 let auth:Record<string,string>,connected:ReturnType<typeof parsePrivateMobileBankMutationResult>;
 try{auth=await login();connected=parsePrivateMobileBankMutationResult(await post(bank.connect,{institutionId:'synthetic-demo-v1'},200,{...auth,...key()}));
  await post(bank.sync,{connectionId:connected.connection.connectionId},200,{...auth,...key()});
 }catch(error){await harness.dispose();throw error;}
 const read=async(headers=auth)=>parsePrivateMobileDetectionReadResult(await post(detection.read,{},200,headers));
 const scan=async(headers=auth,intent=key())=>post(detection.scan,{},200,{...headers,...intent});
 return {harness,post,key,login,auth,connection:connected.connection.connectionId,read,scan};
}
const actorClaims=(auth:Record<string,string>)=>{
 const claims=JSON.parse(Buffer.from(auth.Authorization!.slice(7).split('.')[1]!,'base64url').toString('utf8')) as {sub:string;sid:string};
 for(const value of [claims.sub,claims.sid])assert.match(value,/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);return claims;
};
const ownerPool=(config:OwnedPrivateMobileConfig)=>new Pool({host:config.host,port:config.port,database:config.database,user:'st233a_fixture_owner',password:config.ownerPassword,max:1});
/** Real HTTP/PG detection feature slice. Raw assertions remain private. */
export async function runPrivateMobileDetectionProof(config:OwnedPrivateMobileConfig){
 let phase='START';const s=await setup(config),{harness,post,key,read,scan}=s;let auth=s.auth;
 const flags:Partial<Record<PrivateDetectionFlag,true>>={};const mark=(flag:PrivateDetectionFlag)=>{flags[flag]=true;};let activeConnection=s.connection;
 try{
  const manual=await harness.readbackTrackingReceipt(),source=await harness.readbackBankReceipt();
  phase='OVERFLOW';await harness.prepareDetectionOverflow();
  try{const before=await harness.readbackDetectionReceipt();await post(detection.scan,{},500,{...auth,...key()});assert.deepEqual(await harness.readbackDetectionReceipt(),before);mark('detectionAmountOverflowRollback');}finally{await harness.restoreDetectionAdversary();}
  assert.deepEqual(await harness.readbackBankReceipt(),source);
  phase='SCAN';await scan();mark('detectionScan');const inbox=await read();assert.ok(inbox.items.length>=2);assert.equal(inbox.nextCursor,null);
  const names=['Netflix','Spotify','iCloud','LinkedIn Premium'];assert.ok(inbox.items.every(item=>names.includes(item.displayName)&&item.status==='DETECTED'&&BigInt(item.expectedAmountMinor)>0n));mark('detectionCanonicalInbox');mark('detectionTrustedNamesOnly');
  const first=await harness.readbackDetectionReceipt(),intent=key();await scan(auth,intent);const repeated=await harness.readbackDetectionReceipt();await scan(auth,intent);assert.deepEqual(await harness.readbackDetectionReceipt(),repeated);await scan();const fresh=await harness.readbackDetectionReceipt();assert.equal(fresh.candidateCount,first.candidateCount);assert.equal(fresh.sourceLinkCount,first.sourceLinkCount);mark('detectionRescanDedup');
  phase='PARALLEL';const parallel=key();await Promise.all([scan(auth,parallel),scan(auth,parallel),scan(auth,key()),scan(auth,key())]);assert.equal((await harness.readbackDetectionReceipt()).candidateCount,first.candidateCount);mark('detectionParallelScan');
  phase='COLLISION';await harness.prepareDetectionCollision();try{const before=await harness.readbackDetectionReceipt();await post(detection.scan,{},500,{...auth,...key()});assert.deepEqual(await harness.readbackDetectionReceipt(),before);mark('detectionCollisionRollback');}finally{await harness.restoreDetectionAdversary();}
  phase='UNMATCHED';await harness.prepareUnmatchedDetectionDescriptor();try{await scan();assert.ok((await read()).items.every(item=>names.includes(item.displayName)));assert.equal((await harness.readbackDetectionReceipt()).candidateCount,first.candidateCount);}finally{await harness.restoreDetectionAdversary();}
  assert.deepEqual(await harness.readbackBankReceipt(),source);
  phase='REVIEW';const candidate=inbox.items[0]!,reviewKey=key(),reviewBody={candidateId:candidate.id,expectedRevision:candidate.revision};
  const confirmed=parsePrivateMobileDetectionReviewResult(await post(detection.confirm,reviewBody,200,{...auth,...reviewKey}));assert.equal(confirmed.status,'ACTIVE');assert.equal(BigInt(confirmed.revision),BigInt(candidate.revision)+1n);mark('detectionConfirm');
  const personal=(await post(paths.ownerRead,{},200,auth)).items as Record<string,unknown>[];const visible=personal.find(item=>item.id===candidate.id);assert.equal(visible?.source,'DETECTED');assert.equal(visible?.status,'ACTIVE');assert.equal(visible?.nextChargeDate,null);
  await post(detection.confirm,reviewBody,409,{...auth,...key()});mark('detectionStaleRevisionDenied');
  const undoKey=key(),undone=parsePrivateMobileDetectionReviewResult(await post(detection.undo,{receiptId:confirmed.receiptId},200,{...auth,...undoKey}));assert.equal(undone.status,'DETECTED');assert.equal(BigInt(undone.revision),BigInt(confirmed.revision)+1n);mark('detectionUndo');
  await post(detection.undo,{receiptId:confirmed.receiptId},409,{...auth,...key()});mark('detectionConsumedUndoDenied');
  const second=(await read()).items.find(item=>item.id!==candidate.id)!;const rejected=parsePrivateMobileDetectionReviewResult(await post(detection.reject,{candidateId:second.id,expectedRevision:second.revision},200,{...auth,...key()}));assert.equal(rejected.status,'REJECTED');assert.ok((await read()).items.every(item=>item.id!==second.id));mark('detectionReject');
  await post(detection.undo,{receiptId:rejected.receiptId},200,{...auth,...key()});
  phase='RESTART';const stable=await harness.readbackDetectionReceipt();await harness.restart();auth=await s.login();assert.deepEqual(await harness.readbackDetectionReceipt(),stable);assert.deepEqual(parsePrivateMobileDetectionReviewResult(await post(detection.confirm,reviewBody,200,{...auth,...reviewKey})),confirmed);mark('detectionRestart');
  phase='TIMING';for(const scenario of OWNED_DETECTION_SCENARIOS){const measured=await runPrivateMobileDetectionTimingProof(s,scenario,activeConnection,auth);mark(measured.flag);if(measured.committedReplayAfterDeadline)mark('detectionCommittedReplayAfterDeadline');activeConnection=measured.connection;auth=measured.auth;}
  phase='TWO_OWNER';const bobSession=parsePrivateMobileSessionResponse(await harness.secondOwnerSession()),bob={Authorization:`Bearer ${bobSession.accessToken}`};const aliceId=actorClaims(auth).sub,bobId=actorClaims(bob).sub;assert.notEqual(aliceId,bobId);
  assert.deepEqual((await read(bob)).items,[]);const bobConnection=parsePrivateMobileBankMutationResult(await post(bank.connect,{institutionId:'synthetic-demo-v1'},200,{...bob,...key()})).connection.connectionId;await post(bank.sync,{connectionId:bobConnection},200,{...bob,...key()});await scan(bob);const bobInbox=await read(bob);assert.ok(bobInbox.items.length>=2);const bobCandidate=bobInbox.items[0]!;
  const bobReview=parsePrivateMobileDetectionReviewResult(await post(detection.confirm,{candidateId:bobCandidate.id,expectedRevision:bobCandidate.revision},200,{...bob,...key()}));assert.equal(bobReview.status,'ACTIVE');assert.equal(parsePrivateMobileDetectionReviewResult(await post(detection.undo,{receiptId:bobReview.receiptId},200,{...bob,...key()})).status,'DETECTED');
  const beforeForeign=await harness.readbackDetectionReceipt();
  for(const [foreign,target,receipt] of [[bob,candidate,confirmed.receiptId],[auth,bobCandidate,bobReview.receiptId]] as const){await post(detection.confirm,{candidateId:target.id,expectedRevision:target.revision},404,{...foreign,...key()});await post(detection.undo,{receiptId:receipt},404,{...foreign,...key()});}
  await post(detection.read,{identityId:aliceId},400,bob);assert.deepEqual(await harness.readbackDetectionReceipt(),beforeForeign);mark('detectionOwnerIsolation');
  const sourceBoth=await harness.readbackBankReceipt();
  phase='RLS';const beforeRls=await harness.readbackDetectionReceipt();const rolePool=new Pool({host:config.host,port:config.port,database:config.database,user:'subtrack_dev_auth_login',password:config.actorPassword,max:1});const client=await rolePool.connect();
  try{
   for(const scopes of [[randomUUID(),randomUUID()],['','']] as const){await client.query('BEGIN');await client.query('SET LOCAL ROLE subtrack_runtime');await client.query("SELECT set_config('app.user_id',$1,true),set_config('app.current_user_id',$2,true)",[...scopes]);
    for(const table of ['st081_detection.candidate','st081_detection.source_link','st081_detection.feedback','st081_detection.review_receipt','st081_detection.scan_receipt'])assert.equal((await client.query(`SELECT * FROM ${table}`)).rowCount,0);await client.query('ROLLBACK');}
   for(const [one,two] of [[aliceId,bobId],[bobId,aliceId]] as const){await client.query('BEGIN');await client.query('SET LOCAL ROLE subtrack_runtime');await client.query("SELECT set_config('app.user_id',$1,true),set_config('app.current_user_id',$2,true)",[one,two]);for(const table of ['st081_detection.candidate','st081_detection.source_link','st081_detection.feedback','st081_detection.review_receipt','st081_detection.scan_receipt'])assert.equal((await client.query(`SELECT * FROM ${table}`)).rowCount,0);await client.query('ROLLBACK');}
   for(const identity of [aliceId,bobId]){await client.query('BEGIN');await client.query('SET LOCAL ROLE subtrack_runtime');await client.query("SELECT set_config('app.user_id',$1,true),set_config('app.current_user_id',$1,true)",[identity]);for(const table of ['st081_detection.candidate','st081_detection.source_link','st081_detection.feedback','st081_detection.review_receipt','st081_detection.scan_receipt'])assert.ok((await client.query(`SELECT * FROM ${table}`)).rowCount!>0);await client.query('ROLLBACK');}
   const role=await client.query("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname='subtrack_runtime'");assert.equal(role.rows[0].rolsuper,false);assert.equal(role.rows[0].rolbypassrls,false);
   for(const [statement,values,code] of [
    ['UPDATE st081_detection.candidate SET merchant_key=$2::text WHERE identity_id=$1::uuid',[bobId,'forbidden'], '42501'],
    ['INSERT INTO st081_detection.feedback(id,identity_id,subscription_id,label,created_at) VALUES($1::uuid,$2::uuid,$3::uuid,$4::text,clock_timestamp())',[randomUUID(),aliceId,candidate.id,'NOT_SUBSCRIPTION'],'42501'],
    ['INSERT INTO st081_detection.source_link(identity_id,subscription_id,raw_transaction_id) SELECT $1::uuid,$2::uuid,raw_transaction_id FROM st081_detection.source_link WHERE identity_id=$1::uuid LIMIT 1',[bobId,candidate.id],'23503'],
   ] as const){
    await client.query('BEGIN');await client.query('SET LOCAL ROLE subtrack_runtime');await client.query("SELECT set_config('app.user_id',$1,true),set_config('app.current_user_id',$1,true)",[bobId]);let denied=false;
    try{await client.query(statement,[...values]);}catch(error){denied=typeof error==='object'&&error!==null&&'code'in error&&error.code===code;}finally{await client.query('ROLLBACK');}assert.equal(denied,true);
   }
  }finally{client.release();await rolePool.end();}assert.deepEqual(await harness.readbackDetectionReceipt(),beforeRls);mark('detectionRlsNegative');
  phase='PURGE';const bankBefore=await harness.readbackBankOwnerReceipt(aliceId),detectionBefore=await harness.readbackDetectionReceipt();await post(bank.disconnect,{connectionId:activeConnection,purge:true},500,{...auth,...key()});assert.deepEqual(await harness.readbackBankOwnerReceipt(aliceId),bankBefore);assert.deepEqual(await harness.readbackDetectionReceipt(),detectionBefore);mark('detectionLinkedPurgeRollback');
  phase='EXPIRED_SESSION';const observer=ownerPool(config),claims=actorClaims(auth);const original=await observer.query('SELECT created_ms::text,expires_ms::text FROM st244_mobile.session WHERE id=$1::uuid AND identity_id=$2::uuid',[claims.sid,claims.sub]);assert.equal(original.rowCount,1);
  try{const expired=harness.detectionNow()-1;await observer.query('UPDATE st244_mobile.session SET created_ms=$3::bigint,expires_ms=$4::bigint WHERE id=$1::uuid AND identity_id=$2::uuid',[claims.sid,claims.sub,expired-86400000,expired]);await post(detection.read,{},401,auth);assert.deepEqual(await harness.readbackDetectionReceipt(),detectionBefore);}finally{await observer.query('UPDATE st244_mobile.session SET created_ms=$3::bigint,expires_ms=$4::bigint WHERE id=$1::uuid AND identity_id=$2::uuid',[claims.sid,claims.sub,original.rows[0].created_ms,original.rows[0].expires_ms]);await observer.end();}mark('detectionExpiredSessionDenied');
  phase='MINIMAL';const schema=ownerPool(config);try{
   const feedback=await schema.query("SELECT column_name FROM information_schema.columns WHERE table_schema='st081_detection' AND table_name='feedback' ORDER BY ordinal_position");assert.deepEqual(feedback.rows.map(row=>row.column_name),['id','identity_id','subscription_id','label','created_at','superseded_by_event_id']);
   const reviewColumns=await schema.query("SELECT column_name FROM information_schema.columns WHERE table_schema='st081_detection' AND table_name='review_receipt' ORDER BY ordinal_position");assert.deepEqual(reviewColumns.rows.map(row=>row.column_name),['id','identity_id','subscription_id','operation','key_h','request_h','pre_revision','post_revision','prior_status','result_status','completed_at','undo_until','consumed_at','undo_of_receipt_id','feedback_id','result_response']);
   const labels=await schema.query("SELECT count(*)::int4 AS n FROM st081_detection.feedback WHERE label NOT IN ('CONFIRMED_SUBSCRIPTION','NOT_SUBSCRIPTION')");assert.equal(labels.rows[0].n,0);
   const receipts=await schema.query('SELECT result_response FROM st081_detection.review_receipt');assert.ok(receipts.rowCount!>0);for(const row of receipts.rows)parsePrivateMobileDetectionReviewResult(row.result_response);
  }finally{await schema.end();}mark('detectionMinimalReceipts');
  assert.deepEqual(await harness.readbackManualTrackingReceipt(),manual);mark('detectionManualPreserved');assert.deepEqual(await harness.readbackBankReceipt(),sourceBoth);mark('detectionSourcePreserved');
  const final=await harness.readbackReceipt(),d=await harness.readbackDetectionReceipt();assert.equal(final.identityCount,2);assert.equal(final.profileCompleteCount,2);assert.equal(final.justMeCount,2);assert.equal(final.subscriptionCount,d.detectedCount+1);
  return Object.freeze({flags:Object.freeze(flags),identityCount:final.identityCount,profileCompleteCount:final.profileCompleteCount,justMeCount:final.justMeCount,manualSubscriptionCount:manual.subscriptionCount,detectedSubscriptionCount:d.detectedCount});
 }catch{throw new Error(`ST249_DETECTION_PROOF_FAILURE phase=${phase}`);}finally{await harness.dispose();}
}

export const DETECTION_TIMING_FLAGS:Readonly<Record<OwnedDetectionScenario,PrivateDetectionFlag>>=Object.freeze({
 'undo-equality-entry':'detectionUndoEqualityDenied','undo-expiry-after-final-fence':'detectionUndoFinalFenceExpiryRollback','undo-expiry-after-epoch':'detectionUndoEpochExpiryRollback','undo-expiry-beforecommit-microtask':'detectionUndoAwaitedVerifyMicrotaskRollback','undo-expiry-finalverify-sync':'detectionUndoFinalVerifySyncRollback','undo-finalverify-microtask-order':'detectionUndoFinalVerifyMicrotaskCommitOrder','undo-expiry-rollback-before':'detectionRollbackBeforeFailureWithheld','undo-expiry-rollback-after':'detectionRollbackAfterFailureWithheld','review-commit-before':'detectionCommitBeforeUncertainty','review-commit-after':'detectionCommitAfterUncertainty'});
/** Fresh legitimate retained-source generation for each irreversible deadline case. */
async function runPrivateMobileDetectionTimingProof(s:Awaited<ReturnType<typeof setup>>,scenario:OwnedDetectionScenario,priorConnection:string,priorAuth:Record<string,string>){
 assert.ok(Object.hasOwn(DETECTION_TIMING_FLAGS,scenario));const {harness,post,key,read,scan}=s;let auth=priorAuth;
 try{
  const oldIds=new Set((await read(auth)).items.map(item=>item.id));await post(bank.disconnect,{connectionId:priorConnection,purge:false},200,{...auth,...key()});
  const connection=parsePrivateMobileBankMutationResult(await post(bank.connect,{institutionId:'synthetic-demo-v1'},200,{...auth,...key()})).connection.connectionId;assert.notEqual(connection,priorConnection);
  await post(bank.sync,{connectionId:connection},200,{...auth,...key()});await scan(auth);
  const candidate=(await read(auth)).items.find(item=>!oldIds.has(item.id));assert.ok(candidate);const originalKey=key(),originalBody={candidateId:candidate.id,expectedRevision:candidate.revision};const original=parsePrivateMobileDetectionReviewResult(await post(detection.confirm,originalBody,200,{...auth,...originalKey}));
  const before=await harness.readbackDetectionReceipt(),manual=await harness.readbackManualTrackingReceipt(),source=await harness.readbackBankReceipt();await harness.armDetectionScenario(scenario);
  const success=scenario==='undo-finalverify-microtask-order',unknown=scenario.includes('rollback-')||scenario.startsWith('review-commit-'),intent=key();const response=await post(detection.undo,{receiptId:original.receiptId},success?200:unknown?500:409,{...auth,...intent});
  const observation=harness.detectionScenarioObservation();assert.equal(observation.fired,true);if(success){assert.equal(observation.commitBeforeTick,true);assert.equal(parsePrivateMobileDetectionReviewResult(response).status,'DETECTED');}else if(unknown){assert.equal(response.code,'INTERNAL_ERROR');assert.equal(observation.discarded,true);assert.equal(Object.hasOwn(response,'revision'),false);}else assert.equal(response.code,'UNDO_EXPIRED');
  const expected=Object.fromEntries(OWNED_DETECTION_BOUNDARIES.map(name=>[name,0]));const equality=scenario==='undo-equality-entry';
  for(const name of ['detectionModeRead','detectionCandidateLock','detectionFinalFence','authorityEpochAfterWork','authorityTokenBeforeCommit','authorityTokenFinalGuard'])expected[name]=1;
  expected.detectionReceiptLock=equality?2:3;
  for(const name of ['detectionCompareUpdate','detectionReceiptConsume','detectionReceiptInsert','detectionFeedbackSupersede'])expected[name]=equality?0:1;
  expected.commitDispatch=success||scenario.startsWith('review-commit-')?1:0;expected.rollbackDispatch=success||scenario==='review-commit-after'?0:1;
  assert.equal(observation.verifies,5);assert.deepEqual(observation.boundaries,expected);
  harness.clearDetectionScenario();await harness.restart();auth=await s.login();const after=await harness.readbackDetectionReceipt();
  if(success||scenario==='review-commit-after'){assert.equal(after.reviewCount,before.reviewCount+1);assert.notEqual(after.digest,before.digest);const replay=parsePrivateMobileDetectionReviewResult(await post(detection.undo,{receiptId:original.receiptId},200,{...auth,...intent}));assert.equal(replay.status,'DETECTED');assert.deepEqual(await harness.readbackDetectionReceipt(),after);}else assert.deepEqual(after,before);
  assert.deepEqual(parsePrivateMobileDetectionReviewResult(await post(detection.confirm,originalBody,200,{...auth,...originalKey})),original);assert.deepEqual(await harness.readbackDetectionReceipt(),after);
  assert.deepEqual(await harness.readbackManualTrackingReceipt(),manual);assert.deepEqual(await harness.readbackBankReceipt(),source);
  return Object.freeze({flag:DETECTION_TIMING_FLAGS[scenario],passed:true as const,committedReplayAfterDeadline:!scenario.startsWith('review-commit-'),connection,auth});
 }catch{throw new Error(`ST249_DETECTION_TIMING_FAILURE scenario=${scenario}`);}
}
export function requireDetectionFlags(flags:Partial<Record<PrivateDetectionFlag,true>>){assert.ok(PRIVATE_DETECTION_FLAGS.every(flag=>flags[flag]===true));}
