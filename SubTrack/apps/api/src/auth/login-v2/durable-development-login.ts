import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { DevelopmentEnrollmentPersonVerifier } from '../identity-provider/development-enrollment-person-verifier.js';
import { hashBrowserBindingCookie } from '../sessions-v2/v2-web-session-binding.js';
import { mintDurableSessionCsrf } from '../session-csrf/durable-session-csrf.js';
import type { EnrollmentWeb } from '../enrollment-v2/durable-development-enrollment.js';

const FAIL = 'AUTH_RESTART_REQUIRED';
const ORIGIN = 'https://localhost:3443';
const DATABASE = 'st237_private_https_profile';
const EPOCH = 'st237_private_https_v1';
const LOGIN = 'subtrack_dev_auth_login';
const HEX = /^[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const KEY = /^[\x21-\x7e]{16,255}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const MAX_TIME = 8_640_000_000_000_000;
const TTL = 300_000;
const KEY_NAMES = ['binding', 'idempotency', 'authority', 'request', 'nonce', 'otp', 'proof', 'person', 'session'] as const;
type KeyName = typeof KEY_NAMES[number];
type Role = 'subtrack_auth_producer' | 'subtrack_runtime' | 'subtrack_identity_provisioner';
type Operation = 'verifySimulatorLogin' | 'createV2Session';
type Keys = Readonly<Record<KeyName, Uint8Array>>;
export type DurableDevelopmentLoginConfig = Readonly<{
  environment: string; enabled: boolean; origin: string; epoch: string; manifestHash: string; database: string;
  pool: Pick<Pool, 'connect'>; clock: () => number; verifier: DevelopmentEnrollmentPersonVerifier; keys: Keys;
}>;
type Witness = Readonly<{ keyH: string; ownerH: string; authorityH: string; requestH: string;
  nonceH: string; bindingH: string; sessionBindingH: string; origin: string; chain: string; epoch: string; manifestH: string }>;
type Tx<T> = Readonly<{ state: 'committed'; value: T } | { state: 'rolledBack' | 'unknown' }>;
type VerifyStage = 'INPUT' | 'PEEK' | 'RESERVE' | 'VERIFIER' | 'SUBJECT_LOOKUP' | 'ISSUE' | 'COMPLETE';
type VerifyOutcome = 'REJECT' | 'RETURN_FALSE' | 'ROLLED_BACK' | 'UNKNOWN_TX' | 'UNKNOWN_COMMIT';
type VerifySqlstate = 'NONE' | 'PRIVILEGE_42501' | 'FK_23503' | 'CHECK_23514' | 'DIVZERO_22012' | 'OTHER';
type TxDiagnostic = (error: unknown, state: 'rolledBack' | 'unknown', commitAttempted: boolean) => void;
const verifySqlstate = (error: unknown): VerifySqlstate => {
  if (error === null || typeof error !== 'object') return 'NONE';
  const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) return 'NONE';
  switch (descriptor.value) {
    case '42501': return 'PRIVILEGE_42501';
    case '23503': return 'FK_23503';
    case '23514': return 'CHECK_23514';
    case '22012': return 'DIVZERO_22012';
    default: return 'OTHER';
  }
};
const fail = (): never => { throw new Error(FAIL); };
const own = (input: unknown, names: readonly string[]): Record<string, unknown> => {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype ||
    Reflect.ownKeys(input).length !== names.length) fail();
  const value: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(input, name);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail();
    value[name] = descriptor!.value;
  }
  return value;
};
const canonical = (value: unknown): value is string => typeof value === 'string' && TOKEN.test(value) &&
  Buffer.from(value, 'base64url').length === 32 && Buffer.from(value, 'base64url').toString('base64url') === value;
const secret = (): string => { const value = randomBytes(32).toString('base64url'); return canonical(value) ? value : fail(); };
const frame = (parts: readonly string[]): string => parts.map(value => `${Buffer.byteLength(value, 'utf8')}:${value}`).join('');
const sha = (domain: string, value: string): string =>
  createHash('sha256').update(`subtrack:browser-nonce:v2:${domain}:`, 'utf8').update(value, 'utf8').digest('hex');
const SCOPE = `ROW($1::subtrack_auth.h,$2::subtrack_auth.h,$3::subtrack_auth.h,$4::subtrack_auth.h,
  $5::subtrack_auth.h,$6::subtrack_auth.h,$7::text,$8::text,$9::text,$10::subtrack_auth.h,
  $11::subtrack_auth.ms)::subtrack_auth.login_scope`;
const CLEAN = `SELECT session_user::text AS session_user, current_user::text AS current_user,
  current_setting('app.user_id',true) AS user_id, current_setting('app.current_user_id',true) AS current_user_id,
  current_database()::text AS database_name`;

/** The only private development login authority. This class is not registered in default API modules. */
export class DurableDevelopmentLogin {
  private readonly pool!: Pick<Pool, 'connect'>;
  private readonly clock!: () => number;
  private readonly verifyEvidence!: DevelopmentEnrollmentPersonVerifier['verify'];
  private readonly keys!: Readonly<Record<KeyName, Buffer>>;
  private readonly manifestH!: string;
  private lastTime = -1;
  constructor(config: DurableDevelopmentLoginConfig) {
    try {
      const c = own(config, ['environment','enabled','origin','epoch','manifestHash','database','pool','clock','verifier','keys']);
      if (process.env.NODE_ENV !== 'development' || c.environment !== 'development' || c.enabled !== true ||
        c.origin !== ORIGIN || c.epoch !== EPOCH || c.database !== DATABASE || !HEX.test(c.manifestHash as string) ||
        !c.pool || typeof (c.pool as Pool).connect !== 'function' || typeof c.clock !== 'function' ||
        !(c.verifier instanceof DevelopmentEnrollmentPersonVerifier)) fail();
      const source = own(c.keys, KEY_NAMES);
      const copied = Object.create(null) as Record<KeyName, Buffer>;
      for (const name of KEY_NAMES) {
        if (!(source[name] instanceof Uint8Array) || (source[name] as Uint8Array).byteLength < 32) fail();
        copied[name] = Buffer.from(source[name] as Uint8Array);
      }
      for (let i=0;i<KEY_NAMES.length;i++) for (let j=i+1;j<KEY_NAMES.length;j++) {
        const a=copied[KEY_NAMES[i]!]!, b=copied[KEY_NAMES[j]!]!;
        if (a.length === b.length && timingSafeEqual(a,b)) fail();
      }
      this.keys=Object.freeze(copied); this.manifestH=c.manifestHash as string;
      this.pool=Object.freeze({connect:(c.pool as Pool).connect.bind(c.pool)});
      this.clock=(c.clock as () => number).bind(c);
      this.verifyEvidence=(c.verifier as DevelopmentEnrollmentPersonVerifier).verify.bind(c.verifier);
    } catch { fail(); }
  }
  private now(): number {
    if (process.env.NODE_ENV !== 'development') fail();
    const value=this.clock();
    if (!Number.isSafeInteger(value) || value<0 || value>MAX_TIME || value<this.lastTime) fail();
    this.lastTime=value; return value;
  }
  private h(name: KeyName, domain: string, parts: readonly string[]): string {
    const value=createHmac('sha256',this.keys[name]).update(frame([domain,...parts]),'utf8').digest('hex');
    return HEX.test(value) ? value : fail();
  }
  private web(input: EnrollmentWeb): Readonly<{nonceH:string;bindingH:string;sessionBindingH:string;chainHint:string}> {
    const w=own(input,['origin','bindingCookie','nonce','chainId','epoch']);
    if (w.origin!==ORIGIN || w.epoch!==EPOCH || !canonical(w.bindingCookie) || !canonical(w.nonce) ||
      typeof w.chainId!=='string' || (w.chainId!=='' && !canonical(w.chainId))) fail();
    return Object.freeze({nonceH:sha('nonce',w.nonce as string),bindingH:sha('cookie',w.bindingCookie as string),
      sessionBindingH:hashBrowserBindingCookie(w.bindingCookie as string),chainHint:w.chainId as string});
  }
  private async clean(client: PoolClient): Promise<void> {
    const result=await client.query(CLEAN), row=result.rows[0];
    if (result.command!=='SELECT' || result.rowCount!==1 || result.rows.length!==1 ||
      row?.session_user!==LOGIN || row?.current_user!==LOGIN || row?.database_name!==DATABASE ||
      ![null,''].includes(row?.user_id ?? null) || ![null,''].includes(row?.current_user_id ?? null)) fail();
  }
  private async role(client: PoolClient, role: Role): Promise<void> {
    await client.query(`SET LOCAL ROLE ${role}`);
    const result=await client.query('SELECT current_user::text AS role');
    if (result.rows.length!==1 || result.rows[0]?.role!==role) fail();
  }
  private async tx<T>(role: Role, work: (client: PoolClient) => Promise<T>, diagnostic?: TxDiagnostic): Promise<Tx<T>> {
    let client: PoolClient|undefined, begun=false, commitAttempted=false, released=false;
    let state: 'rolledBack'|'unknown'='unknown';
    try {
      client=await this.pool.connect(); await this.clean(client);
      if ((await client.query('BEGIN ISOLATION LEVEL READ COMMITTED')).command!=='BEGIN') fail();
      begun=true; await this.role(client,role);
      const value=await work(client);
      commitAttempted=true;
      if ((await client.query('COMMIT')).command!=='COMMIT') fail();
      await this.clean(client); client.release(); released=true;
      return {state:'committed',value};
    } catch (error) {
      if (client && begun && !commitAttempted) try {
        if ((await client.query('ROLLBACK')).command==='ROLLBACK') { await this.clean(client); state='rolledBack'; }
      } catch { state='unknown'; }
      if (diagnostic) try { diagnostic(error,state,commitAttempted); } catch { /* Diagnostics cannot change transaction failure. */ }
      return {state};
    } finally { if (client && !released) try { client.release(new Error(FAIL)); } catch { /* Discard. */ } }
  }
  private async one<T extends QueryResultRow>(client: PoolClient, sql: string, values: readonly unknown[]): Promise<T> {
    const result=await client.query<T>(sql,[...values]);
    if (result.command!=='SELECT' || result.rowCount!==1 || result.rows.length!==1) fail();
    return result.rows[0]!;
  }
  private async bool(client: PoolClient, sql: string, values: readonly unknown[]): Promise<boolean> {
    const row=await this.one<{value:boolean}>(client,sql,values);
    return typeof row.value==='boolean' ? row.value : fail();
  }
  private scope(w: Witness): unknown[] {
    return [w.keyH,w.ownerH,w.authorityH,w.requestH,w.nonceH,w.bindingH,w.origin,w.chain,w.epoch,w.manifestH,this.now()];
  }
  private async witness(web: EnrollmentWeb,key:string,operation:Operation,parts:readonly string[],proofH?:string,
    diagnostic?:TxDiagnostic):Promise<Witness> {
    if (typeof key!=='string' || !KEY.test(key)) fail();
    const w=this.web(web);
    const peek=await this.tx('subtrack_auth_producer',client=>this.one<{value:string|null}>(client,
      'SELECT subtrack_auth.peek($1::subtrack_auth.h,$2::subtrack_auth.h,$3::text,$4::text,$5::subtrack_auth.h,$6::subtrack_auth.ms,$7::text) AS value',
      [w.nonceH,w.bindingH,ORIGIN,EPOCH,this.manifestH,this.now(),'session']),diagnostic);
    const chainValue=peek.state==='committed' ? peek.value.value : fail();
    const chain=typeof chainValue==='string' && canonical(chainValue) ? chainValue : fail();
    if (w.chainHint!=='' && w.chainHint!==chain) fail();
    return Object.freeze({keyH:this.h('idempotency','global-key',[key]),
      ownerH:this.h('idempotency','owner',[secret(),operation]),
      authorityH:proofH ?? this.h('authority','browser',[ORIGIN,w.bindingH,chain]),
      // h() length-frames [operation, strict body fields, resolved chain, nonce digest, cookie digest].
      requestH:this.h('request',operation,[...parts,chain,w.nonceH,w.bindingH]),nonceH:w.nonceH,bindingH:w.bindingH,
      sessionBindingH:w.sessionBindingH,origin:ORIGIN,chain,epoch:EPOCH,manifestH:this.manifestH});
  }
  private async reserve(w:Witness,operation:Operation,diagnostic?:TxDiagnostic):Promise<void> {
    const outcome=await this.tx('subtrack_auth_producer',async client=>{
      const row=await this.one<{value:string|null}>(client,
        'SELECT subtrack_auth.reserve_login($1::subtrack_auth.h,$2::subtrack_auth.h,$3::subtrack_auth.h,$4::subtrack_auth.h,$5::text,$6::text,$7::text,$8::subtrack_auth.h,$9::subtrack_auth.ms) AS value',
        [w.keyH,w.ownerH,w.authorityH,w.requestH,operation,ORIGIN,EPOCH,this.manifestH,this.now()]);
      if (typeof row.value!=='string' || !/^[1-9][0-9]*$/.test(row.value) ||
        BigInt(row.value)>BigInt(Number.MAX_SAFE_INTEGER)) fail();
    },diagnostic);
    if (outcome.state!=='committed') fail();
  }
  private async failBurn(w:Witness,role:Role):Promise<void> {
    try { await this.tx(role,client=>this.bool(client,`SELECT subtrack_auth.fail_login_burn(${SCOPE}) AS value`,this.scope(w))); }
    catch { /* Global key remains burned. */ }
  }
  private async operate<T>(w:Witness,role:Role,work:(client:PoolClient)=>Promise<T>,diagnostic?:TxDiagnostic):Promise<T> {
    const outcome=await this.tx(role,work,diagnostic);
    if (outcome.state==='committed') return outcome.value;
    if (outcome.state==='rolledBack') await this.failBurn(w,role);
    return fail();
  }
  async verifySimulatorLogin(web:EnrollmentWeb,input:Readonly<{demoIdentity:'alice'|'bob'}>,key:string):
    Promise<Readonly<{loginProof:string;nextBrowserNonce:string}>> {
    let stage:VerifyStage='INPUT', outcome:VerifyOutcome='REJECT', sqlstate:VerifySqlstate='NONE';
    const diagnostic:TxDiagnostic=(error,state,commitAttempted)=>{
      outcome=state==='rolledBack' ? 'ROLLED_BACK' : commitAttempted ? 'UNKNOWN_COMMIT' : 'UNKNOWN_TX';
      sqlstate=verifySqlstate(error);
    };
    try {
      const body=own(input,['demoIdentity']);
      if (body.demoIdentity!=='alice' && body.demoIdentity!=='bob') fail();
      const choice=body.demoIdentity as 'alice'|'bob';
      stage='PEEK';
      const w=await this.witness(web,key,'verifySimulatorLogin',[choice],undefined,diagnostic);
      stage='RESERVE';
      await this.reserve(w,'verifySimulatorLogin',diagnostic);
      // The simulator and provisioner lookup precede the issue transaction's locks.
      stage='VERIFIER';
      const raw=own(await this.verifyEvidence(choice),['method','personnummerHmac','verifiedAt','givenName','surname']);
      const at=typeof raw.verifiedAt==='string' ? Date.parse(raw.verifiedAt) : NaN;
      if (raw.method!=='BANKID' || typeof raw.personnummerHmac!=='string' || !HEX.test(raw.personnummerHmac) ||
        typeof raw.verifiedAt!=='string' || !Number.isSafeInteger(at) || new Date(at).toISOString()!==raw.verifiedAt ||
        at>this.now() || this.now()-at>=TTL || typeof raw.givenName!=='string' || typeof raw.surname!=='string') fail();
      const subjectH=this.h('person','subject',[raw.personnummerHmac as string]);
      stage='SUBJECT_LOOKUP';
      const found=await this.tx('subtrack_identity_provisioner',async client=>{
        const result=await client.query<{id:string;external_id:string}>(
          'SELECT id,external_id FROM public.identity WHERE external_id=$1::text',[subjectH]);
        if (result.rows.length!==1 || result.rowCount!==1 || result.rows[0]?.external_id!==subjectH ||
          !UUID.test(result.rows[0]!.id)) fail();
        return result.rows[0]!.id;
      },diagnostic);
      const identityId=found.state==='committed' ? found.value : fail();
      const proof=secret(),nextBrowserNonce=secret();
      stage='ISSUE';
      const issued=await this.operate(w,'subtrack_auth_producer',async client=>{
        await client.query(`SELECT set_config('app.user_id',$1,true),set_config('app.current_user_id',$1,true)`,[identityId]);
        return this.bool(client,`SELECT subtrack_auth.issue_login(${SCOPE},$12::subtrack_auth.h,
          $13::subtrack_auth.h,$14::uuid,$15::subtrack_auth.h,$16::subtrack_auth.h,$17::subtrack_auth.ms) AS value`,
          [...this.scope(w),this.h('proof','login',[proof]),sha('nonce',nextBrowserNonce),identityId,subjectH,w.sessionBindingH,at]);
      },diagnostic);
      if (!issued) { outcome='RETURN_FALSE'; fail(); }
      stage='COMPLETE';
      return Object.freeze({loginProof:`v2.${proof}`,nextBrowserNonce});
    } catch {
      try { console.error(`ST239_VERIFY_DIAGNOSTIC stage=${stage} outcome=${outcome} sqlstate=${sqlstate}`); }
      catch { /* Log failure must not mask authentication failure. */ }
      return fail();
    }
  }
  async createV2Session(web:EnrollmentWeb,input:Readonly<{loginProof:string}>,key:string):
    Promise<Readonly<{identityId:string;sessionId:string;refreshToken:string;csrfToken:string;browserChainId:string}>> {
    try {
      const body=own(input,['loginProof']);
      if (typeof body.loginProof!=='string' || !body.loginProof.startsWith('v2.') || !canonical(body.loginProof.slice(3))) fail();
      const loginProof=body.loginProof as string;
      const proofH=this.h('proof','login',[loginProof.slice(3)]);
      const w=await this.witness(web,key,'createV2Session',[loginProof],proofH);
      await this.reserve(w,'createV2Session');
      const sessionId=randomUUID(),familyId=randomUUID(),refreshToken=`v2r.${secret()}`;
      const csrf=mintDurableSessionCsrf();
      const refreshH=createHash('sha256').update('subtrack:auth-refresh:v2:','utf8').update(refreshToken,'utf8').digest('hex');
      const identityId=await this.operate(w,'subtrack_runtime',async client=>{
        const material=await this.one<{value:string|null}>(client,
          `SELECT subtrack_auth.login_material(${SCOPE},$12::subtrack_auth.h) AS value`,[...this.scope(w),proofH]);
        const ownerId=typeof material.value==='string' && UUID.test(material.value) ? material.value : fail();
        await client.query(`SELECT set_config('app.user_id',$1,true),set_config('app.current_user_id',$1,true)`,[ownerId]);
        const owner=await client.query<{id:string;deleted_at:Date|null}>(
          'SELECT id,deleted_at FROM public.identity WHERE id=$1::uuid FOR UPDATE',[ownerId]);
        if (owner.rowCount!==1 || owner.rows[0]?.id!==ownerId || owner.rows[0]?.deleted_at!==null) fail();
        const consumed=await this.bool(client,
          `SELECT subtrack_auth.consume_login(${SCOPE},$12::subtrack_auth.h,$13::uuid,$14::uuid,
          $15::uuid,$16::subtrack_auth.h,$17::subtrack_auth.h) AS value`,
          [...this.scope(w),proofH,ownerId,sessionId,familyId,refreshH,csrf.digest]);
        if (!consumed) fail();
        return ownerId;
      });
      return Object.freeze({identityId,sessionId,refreshToken,csrfToken:csrf.token,browserChainId:w.chain});
    } catch { return fail(); }
  }
}
