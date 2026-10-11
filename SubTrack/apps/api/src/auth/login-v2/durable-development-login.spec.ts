import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { DevelopmentEnrollmentPersonVerifier } from '../identity-provider/development-enrollment-person-verifier.js';
import { hashBrowserBindingCookie } from '../sessions-v2/v2-web-session-binding.js';
import { hashDurableSessionCsrf } from '../session-csrf/durable-session-csrf.js';
import { DurableDevelopmentLogin, type DurableDevelopmentLoginConfig } from './durable-development-login.js';

const NOW = 1_800_000_000_000;
const OWNER = '00000000-0000-4000-8000-000000000001';
const token = (byte: number): string => Buffer.alloc(32, byte).toString('base64url');
const web = Object.freeze({origin:'https://localhost:3443',bindingCookie:token(1),nonce:token(2),chainId:'',epoch:'st237_private_https_v1'});
const keyNames = ['binding','idempotency','authority','request','nonce','otp','proof','person','session'] as const;
type Reply = {command:string;rowCount:number;rows:Record<string,unknown>[]};
const reply = (command:string,rows:Record<string,unknown>[]=[]):Reply => ({command,rowCount:rows.length,rows});

function fixture() {
  const calls:{sql:string;values:unknown[]}[]=[];
  const releases:unknown[]=[];
  let role='subtrack_dev_auth_login', userId:string|null=null, commits=0, failCommit=-1, dirtyAfterCommit=false;
  let now=NOW, ownerFound=true, ownerLive=true, transitionFalse='', browserChain=token(5);
  const verifier=new DevelopmentEnrollmentPersonVerifier({environment:'development',enabled:true,
    simulatorHmacKey:new Uint8Array(32).fill(51),clock:()=>now});
  const client={
    query:vi.fn(async (sql:string,values:unknown[]=[]):Promise<Reply>=>{
      calls.push({sql,values});
      if (sql.startsWith('SELECT session_user::text')) return reply('SELECT',[{session_user:'subtrack_dev_auth_login',
        current_user:dirtyAfterCommit && commits>=3?'subtrack_runtime':'subtrack_dev_auth_login',
        user_id:userId,current_user_id:userId,database_name:'st237_private_https_profile'}]);
      if (sql.startsWith('BEGIN')) {role='subtrack_dev_auth_login';userId=null;return reply('BEGIN');}
      if (sql.startsWith('SET LOCAL ROLE ')) {role=sql.slice('SET LOCAL ROLE '.length);return reply('SET');}
      if (sql==='SELECT current_user::text AS role') return reply('SELECT',[{role}]);
      if (sql==='ROLLBACK') {role='subtrack_dev_auth_login';userId=null;return reply('ROLLBACK');}
      if (sql==='COMMIT') {commits++;if (commits===failCommit) throw new Error('unknown commit');
        role='subtrack_dev_auth_login';userId=null;return reply('COMMIT');}
      if (sql.includes("set_config('app.user_id'")) {userId=String(values[0]);return reply('SELECT',[{set_config:userId}]);}
      if (sql.includes('subtrack_auth.peek(')) return reply('SELECT',[{value:browserChain}]);
      if (sql.includes('subtrack_auth.reserve_login(')) return reply('SELECT',[{value:'1'}]);
      if (sql.includes('FROM public.identity WHERE external_id='))
        return reply('SELECT',ownerFound?[{id:OWNER,external_id:values[0]}]:[]);
      if (sql.includes('subtrack_auth.login_material(')) return reply('SELECT',[{value:OWNER}]);
      if (sql.includes('FROM public.identity WHERE id=')) return reply('SELECT',ownerLive?[{id:OWNER,deleted_at:null}]:[]);
      if (sql.includes('subtrack_auth.')) return reply('SELECT',[{value:!sql.includes(`subtrack_auth.${transitionFalse}(`)}]);
      throw new Error(`unexpected SQL: ${sql}`);
    }),
    release:vi.fn((error?:Error)=>{releases.push(error);}),
  };
  const pool={connect:vi.fn(async()=>client as unknown as PoolClient)} as unknown as Pick<Pool,'connect'>;
  const keys=Object.fromEntries(keyNames.map((name,index)=>[name,new Uint8Array(32).fill(index+11)])) as DurableDevelopmentLoginConfig['keys'];
  const config:DurableDevelopmentLoginConfig={environment:'development',enabled:true,origin:web.origin,epoch:web.epoch,
    manifestHash:'b'.repeat(64),database:'st237_private_https_profile',pool,clock:()=>now,verifier,keys};
  return {calls,releases,client,pool,config,verifier,service:()=>new DurableDevelopmentLogin(config),
    time:(value:number)=>{now=value;}, chain:(value:string)=>{browserChain=value;},
    missingOwner:()=>{ownerFound=false;}, deletedOwner:()=>{ownerLive=false;},
    failNthCommit:(value:number)=>{failCommit=value;}, dirtyAfterCommit:()=>{dirtyAfterCommit=true;},
    falseTransition:(value:string)=>{transitionFalse=value;}};
}
async function denied(promise:Promise<unknown>) {
  const error=await promise.catch((value:unknown)=>value);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toBe('AUTH_RESTART_REQUIRED');
  expect(Object.keys(error as object)).toEqual([]);
}
beforeEach(()=>{vi.stubEnv('NODE_ENV','development');});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});

describe('private durable returning login',()=>{
  it('binds the reserved request digest to strict body, resolved chain, nonce and binding cookie',async()=>{
    async function reservedRequestH(browser=web, proof=token(7), chain=token(5)) {
      const f=fixture();f.chain(chain);
      await f.service().createV2Session(browser,{loginProof:`v2.${proof}`},'session-key-1234567');
      const reserve=f.calls.find(c=>c.sql.includes('subtrack_auth.reserve_login('));
      expect(reserve?.values[3]).toMatch(/^[a-f0-9]{64}$/);
      return reserve!.values[3];
    }
    const baseline=await reservedRequestH();
    expect(await reservedRequestH(web,token(8))).not.toBe(baseline);
    expect(await reservedRequestH(web,token(7),token(6))).not.toBe(baseline);
    expect(await reservedRequestH({...web,nonce:token(9)})).not.toBe(baseline);
    expect(await reservedRequestH({...web,bindingCookie:token(10)})).not.toBe(baseline);
  });
  it('rejects configuration, asserted identity, malformed web state and regressing time before authority work',async()=>{
    const f=fixture(), service=f.service();
    expect(()=>new DurableDevelopmentLogin({...f.config,environment:'production'})).toThrow('AUTH_RESTART_REQUIRED');
    expect(()=>new DurableDevelopmentLogin({...f.config,keys:{...f.config.keys,proof:f.config.keys.otp}})).toThrow('AUTH_RESTART_REQUIRED');
    await denied(service.verifySimulatorLogin(web,{demoIdentity:'alice',identityId:OWNER} as never,'verify-key-1234567'));
    await denied(service.verifySimulatorLogin({...web,bindingCookie:'bad'},{demoIdentity:'alice'},'verify-key-1234567'));
    expect(f.calls).toHaveLength(0);
    await service.createV2Session(web,{loginProof:`v2.${token(7)}`},'session-key-1234567');
    f.time(NOW-1);
    await denied(service.verifySimulatorLogin(web,{demoIdentity:'alice'},'second-key-1234567'));
  });

  it('reserves before trusted verifier and does not hold a database transaction across the provider wait',async()=>{
    const f=fixture();
    let release!:(value:Awaited<ReturnType<DevelopmentEnrollmentPersonVerifier['verify']>>)=>void;
    vi.spyOn(f.verifier,'verify').mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
    const pending=f.service().verifySimulatorLogin(web,{demoIdentity:'bob'},'verify-key-1234567');
    await vi.waitFor(()=>expect(typeof release).toBe('function'));
    expect(f.calls.filter(c=>c.sql==='COMMIT')).toHaveLength(2);
    expect(f.calls.some(c=>c.sql.includes('subtrack_auth.issue_login('))).toBe(false);
    release({method:'BANKID',personnummerHmac:'a'.repeat(64),verifiedAt:new Date(NOW).toISOString(),givenName:'Bob',surname:'Berg'});
    const result=await pending;
    expect(result.loginProof).toMatch(/^v2\.[A-Za-z0-9_-]{43}$/);
    expect(result.nextBrowserNonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const sql=f.calls.map(c=>c.sql);
    expect(sql.indexOf('SET LOCAL ROLE subtrack_identity_provisioner')).toBeGreaterThan(sql.findIndex(s=>s.includes('subtrack_auth.reserve_login(')));
    expect(sql.findIndex(s=>s.includes('subtrack_auth.issue_login('))).toBeGreaterThan(sql.findIndex(s=>s.includes('FROM public.identity WHERE external_id=')));
    const issue=f.calls.find(c=>c.sql.includes('subtrack_auth.issue_login('));
    expect(issue?.values.at(-4)).toBe(OWNER);
    expect(issue?.values.at(-1)).toBe(NOW);
    expect(issue?.values.at(-2)).toBe(hashBrowserBindingCookie(web.bindingCookie));
    expect(issue?.values).not.toContain(result.loginProof);
    expect(f.releases.every(value=>value===undefined)).toBe(true);
  });

  it('collapses missing subject and expired trusted result without issuing proof',async()=>{
    const missing=fixture();missing.missingOwner();
    await denied(missing.service().verifySimulatorLogin(web,{demoIdentity:'alice'},'verify-key-1234567'));
    expect(missing.calls.some(c=>c.sql.includes('subtrack_auth.issue_login('))).toBe(false);
    const expired=fixture();
    vi.spyOn(expired.verifier,'verify').mockResolvedValue({method:'BANKID',personnummerHmac:'a'.repeat(64),
      verifiedAt:new Date(NOW-300_000).toISOString(),givenName:'Alice',surname:'Andersson'});
    await denied(expired.service().verifySimulatorLogin(web,{demoIdentity:'alice'},'verify-key-1234567'));
    expect(expired.calls.some(c=>c.sql.includes('FROM public.identity WHERE external_id='))).toBe(false);
  });

  it('withholds a verification proof after unknown issue commit without replay or compensation',async()=>{
    const f=fixture();f.failNthCommit(4);
    vi.spyOn(f.verifier,'verify').mockResolvedValue({method:'BANKID',personnummerHmac:'a'.repeat(64),
      verifiedAt:new Date(NOW).toISOString(),givenName:'Alice',surname:'Andersson'});
    await denied(f.service().verifySimulatorLogin(web,{demoIdentity:'alice'},'verify-key-1234567'));
    expect(f.calls.filter(c=>c.sql.includes('subtrack_auth.issue_login('))).toHaveLength(1);
    expect(f.calls.some(c=>c.sql==='ROLLBACK')).toBe(false);
    expect(f.calls.some(c=>c.sql.includes('subtrack_auth.fail_login_burn('))).toBe(false);
    expect(f.releases.at(-1)).toBeInstanceOf(Error);
  });

  it('locks live owner and consumes proof with new session and CSRF in one transaction',async()=>{
    const f=fixture();
    const result=await f.service().createV2Session(web,{loginProof:`v2.${token(7)}`},'session-key-1234567');
    const sql=f.calls.map(c=>c.sql);
    const material=sql.findIndex(s=>s.includes('subtrack_auth.login_material('));
    const ownerGuc=sql.findIndex(s=>s.includes("set_config('app.user_id'"));
    const lock=sql.findIndex(s=>s.includes('FROM public.identity WHERE id='));
    const consume=sql.findIndex(s=>s.includes('subtrack_auth.consume_login('));
    expect(material).toBeGreaterThan(sql.findIndex(s=>s.includes('subtrack_auth.reserve_login(')));
    expect(ownerGuc).toBeGreaterThan(material);expect(lock).toBeGreaterThan(ownerGuc);
    expect(consume).toBeGreaterThan(lock);expect(sql.lastIndexOf('COMMIT')).toBeGreaterThan(consume);
    expect(sql.slice(material,consume).filter(s=>s==='COMMIT')).toHaveLength(0);
    const issued=f.calls[consume]!;
    for (const name of ['peek','reserve_login','login_material','consume_login']) {
      const statement=f.calls.find(c=>c.sql.includes(`subtrack_auth.${name}(`));
      expect(statement?.sql).toMatch(/\$1::/);
      expect(statement?.values.length).toBeGreaterThan(0);
    }
    expect(issued.values.at(-2)).toBe(createHash('sha256').update('subtrack:auth-refresh:v2:','utf8')
      .update(result.refreshToken,'utf8').digest('hex'));
    expect(issued.values.at(-1)).toBe(hashDurableSessionCsrf(result.csrfToken));
    expect(result).toMatchObject({identityId:OWNER,browserChainId:token(5)});
    expect(result.refreshToken).toMatch(/^v2r\.[A-Za-z0-9_-]{43}$/);
  });

  it('settles only owned burn after known rollback and discloses no credentials',async()=>{
    const f=fixture();f.deletedOwner();
    await denied(f.service().createV2Session(web,{loginProof:`v2.${token(7)}`},'session-key-1234567'));
    expect(f.calls.some(c=>c.sql==='ROLLBACK')).toBe(true);
    expect(f.calls.some(c=>c.sql.includes('subtrack_auth.consume_login('))).toBe(false);
    expect(f.calls.some(c=>c.sql.includes('subtrack_auth.fail_login_burn('))).toBe(true);
    const falseConsume=fixture();falseConsume.falseTransition('consume_login');
    await denied(falseConsume.service().createV2Session(web,{loginProof:`v2.${token(7)}`},'session-key-1234567'));
    expect(falseConsume.calls.filter(c=>c.sql==='COMMIT')).toHaveLength(3);
    expect(falseConsume.calls.some(c=>c.sql.includes('subtrack_auth.fail_login_burn('))).toBe(true);
  });

  it('does not retry mutation or settle burn after uncertain commit or failed postcommit cleanup',async()=>{
    const unknown=fixture();unknown.failNthCommit(3);
    await denied(unknown.service().createV2Session(web,{loginProof:`v2.${token(7)}`},'session-key-1234567'));
    expect(unknown.calls.filter(c=>c.sql.includes('subtrack_auth.consume_login('))).toHaveLength(1);
    expect(unknown.calls.some(c=>c.sql==='ROLLBACK')).toBe(false);
    expect(unknown.calls.some(c=>c.sql.includes('subtrack_auth.fail_login_burn('))).toBe(false);
    expect(unknown.releases.at(-1)).toBeInstanceOf(Error);
    const dirty=fixture();dirty.dirtyAfterCommit();
    await denied(dirty.service().createV2Session(web,{loginProof:`v2.${token(7)}`},'session-key-1234567'));
    expect(dirty.releases.at(-1)).toBeInstanceOf(Error);
  });
});
