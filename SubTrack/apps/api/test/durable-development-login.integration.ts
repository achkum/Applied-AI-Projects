// Run only after natural Alice enrollment in the owned private PG16 browser proof.
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { loadPrivateAuthEpoch } from '../src/auth/private-auth-epoch';
import { createDevelopmentBootstrapPostgresPort } from '../src/auth/browser-nonce/development-bootstrap-postgres-port';
import { createDevelopmentBootstrapTransaction } from '../src/auth/browser-nonce/development-bootstrap-transaction';
import { DevelopmentEnrollmentPersonVerifier } from '../src/auth/identity-provider/development-enrollment-person-verifier';
import { DurableDevelopmentLogin } from '../src/auth/login-v2/durable-development-login';

const configPath = process.env.ST237_PRIVATE_CONFIG;
const password = process.env.ST237_PG_PASSWORD;
const ownerPassword = process.env.ST237_OWNER_PASSWORD;
const port = Number(process.env.ST237_PG_PORT);
if (!configPath || !password || !/^[a-f0-9]{48}$/.test(password) ||
  !ownerPassword || !/^[a-f0-9]{48}$/.test(ownerPassword) ||
  !Number.isInteger(port) || port<1 || port>65535) throw Error('qualified-config');
const epoch = loadPrivateAuthEpoch(configPath);
const actor = new Pool({host:'127.0.0.1',port,database:epoch.database,user:epoch.login,password,
  max:4,connectionTimeoutMillis:3000,query_timeout:3000,statement_timeout:2000,
  application_name:'st239-login-proof'});
const owner = new Pool({host:'127.0.0.1',port,database:epoch.database,user:'st233a_fixture_owner',
  password:ownerPassword,max:1,connectionTimeoutMillis:3000,query_timeout:3000,
  statement_timeout:2000,application_name:'st239-login-catalog-proof'});
const verifier = new DevelopmentEnrollmentPersonVerifier({environment:'development',enabled:true,
  simulatorHmacKey:epoch.simulatorHmacKey,clock:Date.now});
const create = (pool: Pick<Pool,'connect'> = actor) => new DurableDevelopmentLogin({environment:'development',
  enabled:true,origin:epoch.origin,epoch:epoch.epoch,manifestHash:epoch.manifestHash,
  database:epoch.database,pool,clock:Date.now,verifier,keys:epoch.enrollmentKeys});
const bootstrap = () => createDevelopmentBootstrapTransaction({enabled:true,origin:epoch.origin,
  epoch:epoch.epoch,manifestHash:epoch.manifestHash,retentionMs:86_400_000,
  idempotencyKey:epoch.bootstrapKeys.idempotencyKey,originKey:epoch.bootstrapKeys.originKey},
  createDevelopmentBootstrapPostgresPort({enabled:true,origin:epoch.origin,epoch:epoch.epoch,
    manifestHash:epoch.manifestHash,database:epoch.database,password,port}));
const key = () => `st239-login-${randomUUID()}`;
const denied = async (label:string,run:()=>Promise<unknown>) => {
  try { await run(); } catch (error) {
    if (error instanceof Error && error.message==='AUTH_RESTART_REQUIRED') return;
    throw Error(`${label}:unsafe-error`);
  }
  throw Error(`${label}:accepted`);
};
function uncertainCommit(): Pick<Pool,'connect'> {
  let armed=false;
  return {connect: async () => {
    const real=await actor.connect();
    const query=(async (sql:string,values?:unknown[]) => {
      if (sql.startsWith('SELECT subtrack_auth.consume_login(')) armed=true;
      if (sql==='COMMIT' && armed) { armed=false; await real.query('COMMIT'); throw Error('lost-commit-reply'); }
      return real.query(sql,values);
    }) as PoolClient['query'];
    return {query,release:(error?:Error)=>real.release(error)} as PoolClient;
  }};
}
function rejectConsume(): Pick<Pool,'connect'> {
  return {connect: async () => {
    const real=await actor.connect();
    const query=(async (sql:string,values?:unknown[]) => {
      if (sql.startsWith('SELECT subtrack_auth.consume_login(')) throw Error('known-rollback');
      return real.query(sql,values);
    }) as PoolClient['query'];
    return {query,release:(error?:Error)=>real.release(error)} as PoolClient;
  }};
}
const issueWeb = async (service:DurableDevelopmentLogin,identity:'alice'|'bob') => {
  const minted=await bootstrap().issue(key(),'session');
  const source={origin:epoch.origin,bindingCookie:minted.cookieSecret,nonce:minted.nonce,
    chainId:'',epoch:epoch.epoch};
  const proof=await service.verifySimulatorLogin(source,{demoIdentity:identity},key());
  return {source,terminal:{...source,nonce:proof.nextBrowserNonce},proof:proof.loginProof};
};
const counts = async () => {
  const result=await owner.query<{sessions:number;credentials:number;csrf:number;proofs:number}>(
    `SELECT (SELECT count(*)::int FROM subtrack_auth.session) AS sessions,
      (SELECT count(*)::int FROM subtrack_auth.credential) AS credentials,
      (SELECT count(*)::int FROM subtrack_auth.csrf) AS csrf,
      (SELECT count(*)::int FROM subtrack_auth.login_proof) AS proofs`);
  return result.rows[0]!;
};
const roleDenied = async (role:'subtrack_runtime'|'subtrack_auth_producer',sql:string) => {
  const client=await actor.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    await client.query(`SET LOCAL ROLE ${role}`);
    let deniedCall=false;
    try { await client.query(sql); }
    catch (error) { deniedCall=typeof error==='object' && error!==null && 'code' in error &&
      error.code==='42501'; }
    if (!deniedCall) throw Error('cross-purpose-role-call');
  } finally { await client.query('ROLLBACK'); client.release(); }
};
async function main() {
  try {
    const service=create();
    await roleDenied('subtrack_runtime',
      'SELECT subtrack_auth.issue_login(NULL,NULL,NULL,NULL,NULL,NULL,NULL)');
    await roleDenied('subtrack_auth_producer',
      'SELECT subtrack_auth.login_material(NULL,NULL)');
    await roleDenied('subtrack_auth_producer',
      'SELECT subtrack_auth.consume_login(NULL,NULL,NULL,NULL,NULL,NULL,NULL)');
    process.stdout.write('PASS ST239_ACTUAL_PG_SEPARATE_PRODUCER_RUNTIME_FUNCTION_ROLES\n');
    const minted=await bootstrap().issue(key(),'session');
    const web={origin:epoch.origin,bindingCookie:minted.cookieSecret,nonce:minted.nonce,
      chainId:'',epoch:epoch.epoch};
    await denied('cookie',()=>service.verifySimulatorLogin({...web,bindingCookie:minted.nonce},
      {demoIdentity:'alice'},key()));
    const verified=await service.verifySimulatorLogin(web,{demoIdentity:'alice'},key());
    const terminal={...web,nonce:verified.nextBrowserNonce};
    await denied('original-nonce',()=>service.createV2Session(web,{loginProof:verified.loginProof},key()));
    await denied('cross-purpose',()=>service.createV2Session(terminal,
      {loginProof:`v2.${minted.nonce}`},key()));
    const session=await service.createV2Session(terminal,{loginProof:verified.loginProof},key());
    if (!session.identityId || !session.sessionId || !session.csrfToken || !session.refreshToken ||
      !session.browserChainId) throw Error('credential-missing');
    const locked=await owner.connect();
    try {
      await locked.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      await locked.query('SET LOCAL ROLE subtrack_auth_executor');
      await locked.query("SELECT set_config('app.user_id',$1,true),set_config('app.current_user_id',$1,true)",
        [session.identityId]);
      const ownRow=await locked.query('SELECT id FROM public.identity WHERE id=$1::uuid FOR UPDATE',
        [session.identityId]);
      if (ownRow.rowCount!==1) throw Error('executor-owner-lock');
      let deniedUpdate=false;
      await locked.query('SAVEPOINT deny_identity_update');
      try { await locked.query('UPDATE public.identity SET id=id WHERE id=$1::uuid',[session.identityId]); }
      catch (error) { deniedUpdate=typeof error==='object' && error!==null && 'code' in error &&
        error.code==='42501'; }
      await locked.query('ROLLBACK TO SAVEPOINT deny_identity_update');
      if (!deniedUpdate) throw Error('executor-identity-update');
      await locked.query('ROLLBACK');
    } finally { locked.release(); }
    await denied('one-use',()=>service.createV2Session(terminal,{loginProof:verified.loginProof},key()));
    process.stdout.write('PASS ST239_ACTUAL_PG_NATURAL_OWNER_LOGIN_ONE_USE_NONCE_CROSS_PURPOSE_ROW_LOCK\n');

    const race=await issueWeb(service,'alice');
    const raced=await Promise.allSettled([
      create().createV2Session(race.terminal,{loginProof:race.proof},key()),
      create().createV2Session(race.terminal,{loginProof:race.proof},key()),
    ]);
    if (raced.filter(item=>item.status==='fulfilled').length!==1 ||
      raced.filter(item=>item.status==='rejected' && item.reason instanceof Error &&
        item.reason.message==='AUTH_RESTART_REQUIRED').length!==1) throw Error('race-not-once');
    process.stdout.write('PASS ST239_ACTUAL_PG_CONCURRENT_LOGIN_REDEEM_ONCE\n');

    const rollback=await issueWeb(service,'alice');
    const beforeRollback=await counts();
    await denied('known-rollback',()=>create(rejectConsume()).createV2Session(rollback.terminal,
      {loginProof:rollback.proof},key()));
    const afterRollback=await counts();
    if (JSON.stringify(afterRollback)!==JSON.stringify(beforeRollback)) throw Error('rollback-residue');
    const recovered=await service.createV2Session(rollback.terminal,{loginProof:rollback.proof},key());
    if (recovered.identityId!==session.identityId) throw Error('rollback-recovery-owner');
    process.stdout.write('PASS ST239_ACTUAL_PG_KNOWN_ROLLBACK_ATOMIC_NO_SESSION_RESIDUE\n');

    const bob=await issueWeb(service,'bob');
    await denied('cross-binding',()=>service.createV2Session(
      {...bob.terminal,bindingCookie:race.terminal.bindingCookie},{loginProof:bob.proof},key()));
    await denied('cross-origin',()=>service.createV2Session(
      {...bob.terminal,origin:'https://evil.invalid'},{loginProof:bob.proof},key()));
    const bobIdentity=await owner.query<{id:string}>(
      "SELECT identity_id AS id FROM public.identity_profile WHERE display_name='Second Owner'");
    if (bobIdentity.rowCount!==1) throw Error('bob-owner-absent');
    const bobId=bobIdentity.rows[0]!.id;
    await owner.query('UPDATE public.identity SET deleted_at=clock_timestamp() WHERE id=$1::uuid',
      [bobId]);
    try {
      await denied('deleted-owner-consume',()=>service.createV2Session(bob.terminal,
        {loginProof:bob.proof},key()));
      await denied('deleted-owner-issue',()=>issueWeb(service,'bob'));
    } finally {
      await owner.query('UPDATE public.identity SET deleted_at=NULL WHERE id=$1::uuid',[bobId]);
    }
    const bobResidue=await owner.query<{sessions:number}>(
      'SELECT count(*)::int AS sessions FROM subtrack_auth.session WHERE identity_id=$1::uuid',
      [bobId]);
    if (!bobResidue.rows[0] || bobResidue.rows[0].sessions<1) throw Error('bob-prior-natural-session-missing');
    process.stdout.write('PASS ST239_ACTUAL_PG_BINDING_ORIGIN_DELETED_OWNER_DENIAL\n');

    const bobSubject=await owner.query<{external_id:string}>(
      'SELECT external_id FROM public.identity WHERE id=$1::uuid AND deleted_at IS NULL',[bobId]);
    if (bobSubject.rowCount!==1 || !/^[a-f0-9]{64}$/.test(bobSubject.rows[0]!.external_id))
      throw Error('bob-trusted-subject-absent');
    const originalSubject=bobSubject.rows[0]!.external_id;
    const missingSubject=randomUUID().replaceAll('-','')+randomUUID().replaceAll('-','');
    const beforeMissingSubject=await counts();
    const changedSubject=await owner.query(
      'UPDATE public.identity SET external_id=$1::text WHERE id=$2::uuid AND external_id=$3::text RETURNING id',
      [missingSubject,bobId,originalSubject]);
    if (changedSubject.rowCount!==1) throw Error('bob-subject-fixture-change');
    let proofFailed=false;
    let proofFailure:unknown;
    try {
      await denied('missing-trusted-subject',()=>issueWeb(service,'bob'));
      if (JSON.stringify(await counts())!==JSON.stringify(beforeMissingSubject))
        throw Error('missing-subject-session-residue');
    } catch (error) {
      proofFailed=true;
      proofFailure=error;
    }
    let restoreFailed=false;
    let restoreFailure:unknown;
    try {
      const restored=await owner.query(
        'UPDATE public.identity SET external_id=$1::text WHERE id=$2::uuid AND external_id=$3::text RETURNING id',
        [originalSubject,bobId,missingSubject]);
      if (restored.rowCount!==1) throw Error('bob-subject-fixture-restore');
    } catch (error) {
      restoreFailed=true;
      restoreFailure=error;
    }
    if (proofFailed && restoreFailed)
      throw new AggregateError([proofFailure,restoreFailure],'bob-subject-proof-and-restore');
    if (proofFailed) throw proofFailure;
    if (restoreFailed) throw restoreFailure;
    process.stdout.write('PASS ST239_ACTUAL_PG_MISSING_TRUSTED_SUBJECT_DENIED\n');

    const second=await bootstrap().issue(key(),'session');
    const secondWeb={...web,bindingCookie:second.cookieSecret,nonce:second.nonce};
    const secondProof=await service.verifySimulatorLogin(secondWeb,{demoIdentity:'alice'},key());
    const secondTerminal={...secondWeb,nonce:secondProof.nextBrowserNonce};
    await denied('unknown-commit',()=>create(uncertainCommit()).createV2Session(secondTerminal,
      {loginProof:secondProof.loginProof},key()));
    await denied('unknown-commit-replay',()=>service.createV2Session(secondTerminal,
      {loginProof:secondProof.loginProof},key()));
    process.stdout.write('PASS ST239_ACTUAL_PG_UNKNOWN_COMMIT_NO_CREDENTIAL_REPLAY\n');
    const third=await bootstrap().issue(key(),'session');
    const thirdWeb={...web,bindingCookie:third.cookieSecret,nonce:third.nonce};
    const thirdProof=await service.verifySimulatorLogin(thirdWeb,{demoIdentity:'alice'},key());
    const proofDigest=await owner.query<{proof_h:string;terminal_nonce_h:string}>(
      `SELECT proof_h,terminal_nonce_h FROM subtrack_auth.login_proof WHERE identity_id=$1::uuid`,
      [session.identityId]);
    if (proofDigest.rowCount!==1) throw Error('prune-proof-count');
    const proofH=proofDigest.rows[0]!.proof_h, nonceH=proofDigest.rows[0]!.terminal_nonce_h;
    // Advance only this disposable fixture row to its expired boundary.
    await owner.query(`WITH t AS (SELECT (extract(epoch from clock_timestamp())*1000)::bigint AS ms)
      UPDATE subtrack_auth.login_proof SET issued_ms=t.ms-300001,expires_ms=t.ms-1
      FROM t WHERE proof_h=$1::subtrack_auth.h`,[proofH]);
    const beforeExpired=await counts();
    await denied('expired-proof-with-live-nonce',()=>service.createV2Session(
      {...thirdWeb,nonce:thirdProof.nextBrowserNonce},
      {loginProof:thirdProof.loginProof},key()));
    if (JSON.stringify(await counts())!==JSON.stringify(beforeExpired))
      throw Error('expired-proof-live-nonce-residue');
    await owner.query(`WITH t AS (SELECT (extract(epoch from clock_timestamp())*1000)::bigint AS ms)
      UPDATE subtrack_auth.nonce SET issued_ms=t.ms-300001,expires_ms=t.ms-1
      FROM t WHERE nonce_h=$1::subtrack_auth.h`,[nonceH]);
    await denied('expired-proof-redemption',()=>service.createV2Session(
      {...thirdWeb,nonce:thirdProof.nextBrowserNonce},
      {loginProof:thirdProof.loginProof},key()));
    if (JSON.stringify(await counts())!==JSON.stringify(beforeExpired))
      throw Error('expired-proof-session-residue');
    const expiredStillBound=await owner.query<{proofs:number;nonces:number}>(
      `SELECT (SELECT count(*)::int FROM subtrack_auth.login_proof WHERE proof_h=$1::subtrack_auth.h) AS proofs,
        (SELECT count(*)::int FROM subtrack_auth.nonce WHERE nonce_h=$2::subtrack_auth.h) AS nonces`,
      [proofH,nonceH]);
    if (expiredStillBound.rows[0]?.proofs!==1 || expiredStillBound.rows[0]?.nonces!==1)
      throw Error('expired-proof-pruned-before-redemption-check');
    process.stdout.write('PASS ST239_ACTUAL_PG_EXPIRED_PROOF_REDEMPTION_DENIED\n');
    const prune=await actor.connect();
    try {
      await prune.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      await prune.query('SET LOCAL ROLE subtrack_runtime');
      const result=await prune.query<{ok:boolean}>(
        'SELECT subtrack_auth.prune_nonces($1::text,$2::subtrack_auth.h,$3::subtrack_auth.ms) AS ok',
        [epoch.epoch,epoch.manifestHash,Date.now()]);
      if (result.rows[0]?.ok!==true) throw Error('prune-rejected');
      await prune.query('COMMIT');
    } finally { prune.release(); }
    const residue=await owner.query(`SELECT (SELECT count(*)::int FROM subtrack_auth.login_proof
        WHERE proof_h=$1::subtrack_auth.h) AS proofs,
        (SELECT count(*)::int FROM subtrack_auth.nonce WHERE nonce_h=$2::subtrack_auth.h) AS nonces`,
      [proofH,nonceH]);
    if (residue.rows[0]?.proofs!==0 || residue.rows[0]?.nonces!==0 || !thirdProof.loginProof) throw Error('prune-residue');
    process.stdout.write('PASS ST239_ACTUAL_PG_EXPIRED_NONCE_CASCADES_EXPIRED_LOGIN_PROOF\n');
  } finally { await actor.end(); await owner.end(); }
}
main().catch(() => { process.stderr.write('FAIL ST239_ACTUAL_PG_LOGIN\n'); process.exitCode=1; });
