import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { normalizeIdentifier } from '@subtrack/contracts/identifiers';
import { DevelopmentEnrollmentPersonVerifier } from '../identity-provider/development-enrollment-person-verifier.js';
import { hashBrowserBindingCookie } from '../sessions-v2/v2-web-session-binding.js';
import { mintDurableSessionCsrf } from '../session-csrf/durable-session-csrf.js';

const UNAVAILABLE = 'AUTH_RESTART_REQUIRED';
const LOGIN_REQUIRED = 'ENROLLMENT_LOGIN_REQUIRED';
const ORIGIN = 'https://st233a.invalid';
const DATABASE = 'st233a_development_auth_foundation_proof';
const LOGIN = 'subtrack_dev_auth_login';
const SECRET = /^[A-Za-z0-9_-]{43}$/;
const HEX = /^[a-f0-9]{64}$/;
const CODE = /^\d{6}$/;
const KEY = /^[\x21-\x7e]{16,255}$/;
const CHAIN = /^[A-Za-z0-9_-]{43}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const MAX_TIME = 8_640_000_000_000_000;
const TTL = 300_000;
const KEY_NAMES = ['binding', 'idempotency', 'authority', 'request', 'nonce', 'otp', 'proof', 'person', 'session'] as const;
type KeyName = typeof KEY_NAMES[number];
type Keys = Readonly<Record<KeyName, Uint8Array>>;
export type EnrollmentProfileView = Readonly<{
  displayName: null; avatarColourToken: null; avatarEmoji: null;
  language: 'sv' | 'en'; theme: 'system'; defaultCurrency: 'SEK'; profileComplete: false;
}>;
type Operation = 'startV2Otp' | 'verifyV2Otp' | 'admitEnrollment' | 'verifyEnrollmentPerson' | 'completeEnrollment';
type Role = 'subtrack_auth_producer' | 'subtrack_runtime' | 'subtrack_identity_provisioner';
export type EnrollmentWeb = Readonly<{ origin: string; bindingCookie: string; nonce: string; chainId: string; epoch: string }>;
export type DurableEnrollmentConfig = Readonly<{
  environment: string; enabled: boolean; origin: string; epoch: string; manifestHash: string; database?: string;
  pool: Pick<Pool, 'connect'>; clock: () => number; verifier: DevelopmentEnrollmentPersonVerifier;
  keys: Keys; developmentOtpCode: () => string;
}>;
type Witness = Readonly<{
  keyH: string; ownerH: string; authorityH: string; requestH: string;
  nonceH: string; bindingH: string; sessionBindingH: string; origin: string; chain: string; epoch: string; manifestH: string;
}>;
type TxResult<T> = Readonly<{ state: 'committed'; value: T } | { state: 'rolledBack' | 'unknown' }>;
const fail = (): never => { throw new Error(UNAVAILABLE); };
const own = (value: unknown, names: readonly string[]): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== names.length) fail();
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail();
    result[name] = descriptor!.value;
  }
  return result;
};
const canonical = (value: unknown): value is string =>
  typeof value === 'string' && SECRET.test(value) && Buffer.from(value, 'base64url').length === 32 &&
  Buffer.from(value, 'base64url').toString('base64url') === value;
const secret = (): string => {
  const value = randomBytes(32).toString('base64url');
  if (!canonical(value)) fail();
  return value;
};
const frame = (values: readonly string[]): string => values.map(value => `${Buffer.byteLength(value, 'utf8')}:${value}`).join('');
const sha = (domain: string, value: string): string =>
  createHash('sha256').update(`subtrack:browser-nonce:v2:${domain}:`, 'utf8').update(value, 'utf8').digest('hex');
const SCOPE = `ROW($1::subtrack_auth.h,$2::subtrack_auth.h,$3::subtrack_auth.h,$4::subtrack_auth.h,
  $5::subtrack_auth.h,$6::subtrack_auth.h,$7::text,$8::text,$9::text,$10::subtrack_auth.h,
  $11::subtrack_auth.ms)::subtrack_auth.enrollment_scope`;
const CLEAN = `SELECT session_user::text AS session_user, current_user::text AS current_user,
  current_setting('app.user_id',true) AS user_id, current_setting('app.current_user_id',true) AS current_user_id,
  current_database()::text AS database_name`;

/** Private development-only durable path. It is deliberately absent from Nest modules and HTTP routes. */
export class DurableDevelopmentEnrollment {
  private readonly origin!: string;
  private readonly epoch!: string;
  private readonly manifestH!: string;
  private readonly database!: string;
  private readonly pool!: Pick<Pool, 'connect'>;
  private readonly clock!: () => number;
  private readonly verifyPersonEvidence!: DevelopmentEnrollmentPersonVerifier['verify'];
  private readonly developmentOtpCode!: () => string;
  private readonly keys!: Readonly<Record<KeyName, Buffer>>;
  private lastTime = -1;

  constructor(config: DurableEnrollmentConfig) {
    try {
      const c = own(config, ['environment', 'enabled', 'origin', 'epoch', 'manifestHash', 'pool',
        'clock', 'verifier', 'keys', 'developmentOtpCode', ...(Object.hasOwn(config, 'database') ? ['database'] : [])]);
      const oldTuple = c.origin === ORIGIN && (c.database === undefined || c.database === DATABASE);
      const privateTuple = c.origin === 'https://localhost:3443' && c.database === 'st237_private_https_profile' &&
        c.epoch === 'st237_private_https_v1';
      if (process.env.NODE_ENV !== 'development' || c.environment !== 'development' ||
        c.enabled !== true || !(oldTuple || privateTuple) || typeof c.epoch !== 'string' ||
        c.epoch.length === 0 || c.epoch !== c.epoch.trim() ||
        typeof c.manifestHash !== 'string' || !HEX.test(c.manifestHash) ||
        !c.pool || typeof (c.pool as Pool).connect !== 'function' ||
        typeof c.clock !== 'function' || !(c.verifier instanceof DevelopmentEnrollmentPersonVerifier) ||
        typeof c.verifier.verify !== 'function' ||
        typeof c.developmentOtpCode !== 'function') fail();
      const source = own(c.keys, KEY_NAMES);
      const copied = Object.create(null) as Record<KeyName, Buffer>;
      for (const name of KEY_NAMES) {
        if (!(source[name] instanceof Uint8Array) || (source[name] as Uint8Array).byteLength < 32) fail();
        copied[name] = Buffer.from(source[name] as Uint8Array);
      }
      for (let i = 0; i < KEY_NAMES.length; i++) for (let j = i + 1; j < KEY_NAMES.length; j++) {
        const a = copied[KEY_NAMES[i]!]!, b = copied[KEY_NAMES[j]!]!;
        if (a.length === b.length && timingSafeEqual(a, b)) fail();
      }
      this.keys = Object.freeze(copied);
      this.origin = c.origin as string;
      this.epoch = c.epoch as string;
      this.manifestH = c.manifestHash as string;
      this.database = c.database === undefined ? DATABASE : c.database as string;
      this.pool = Object.freeze({ connect: (c.pool as Pool).connect.bind(c.pool) });
      this.clock = (c.clock as () => number).bind(c);
      const verifier = c.verifier as DevelopmentEnrollmentPersonVerifier;
      this.verifyPersonEvidence = verifier.verify.bind(verifier);
      this.developmentOtpCode = (c.developmentOtpCode as () => string).bind(c);
    } catch { fail(); }
  }

  private now(): number {
    if (process.env.NODE_ENV !== 'development') fail();
    const value = this.clock();
    if (!Number.isSafeInteger(value) || value < 0 || value > MAX_TIME || value < this.lastTime) fail();
    this.lastTime = value;
    return value;
  }
  private h(name: KeyName, domain: string, values: readonly string[]): string {
    const digest = createHmac('sha256', this.keys[name]);
    digest.update(frame([domain, ...values]), 'utf8');
    const value = digest.digest('hex');
    if (!HEX.test(value)) fail();
    return value;
  }
  private web(input: unknown): Readonly<{ nonceH: string; bindingH: string; sessionBindingH: string; chainHint: string }> {
    const w = own(input, ['origin', 'bindingCookie', 'nonce', 'chainId', 'epoch']);
    if (w.origin !== this.origin || w.epoch !== this.epoch ||
      !canonical(w.bindingCookie) || !canonical(w.nonce) ||
      typeof w.chainId !== 'string' || (w.chainId !== '' && !CHAIN.test(w.chainId))) fail();
    return Object.freeze({ nonceH: sha('nonce', w.nonce as string), bindingH: sha('cookie', w.bindingCookie as string),
      sessionBindingH: hashBrowserBindingCookie(w.bindingCookie as string),
      chainHint: w.chainId as string });
  }
  private async clean(client: PoolClient): Promise<void> {
    const result = await client.query(CLEAN);
    const row = result.rows[0];
    if (result.command !== 'SELECT' || result.rowCount !== 1 || result.rows.length !== 1 ||
      row?.session_user !== LOGIN || row?.current_user !== LOGIN || row?.database_name !== this.database ||
      ![null, ''].includes(row?.user_id ?? null) || ![null, ''].includes(row?.current_user_id ?? null)) fail();
  }
  private async role(client: PoolClient, role: Role): Promise<void> {
    // Role is a closed source literal, never client supplied.
    await client.query(`SET LOCAL ROLE ${role}`);
    const result = await client.query('SELECT current_user::text AS role');
    if (result.rows.length !== 1 || result.rows[0]?.role !== role) fail();
  }
  private async tx<T>(role: Role, work: (client: PoolClient) => Promise<T>): Promise<TxResult<T>> {
    let client: PoolClient | undefined, begun = false, commitAttempted = false, released = false;
    let state: 'rolledBack' | 'unknown' = 'unknown';
    try {
      client = await this.pool.connect();
      await this.clean(client);
      const begin = await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      if (begin.command !== 'BEGIN') fail();
      begun = true;
      await this.role(client, role);
      const value = await work(client);
      commitAttempted = true;
      const committed = await client.query('COMMIT');
      if (committed.command !== 'COMMIT') fail();
      await this.clean(client);
      client.release(); released = true;
      return { state: 'committed', value };
    } catch {
      if (client && begun && !commitAttempted) {
        try {
          const result = await client.query('ROLLBACK');
          if (result.command === 'ROLLBACK') { await this.clean(client); state = 'rolledBack'; }
        } catch { state = 'unknown'; }
      }
      return { state };
    } finally {
      if (client && !released) {
        try { client.release(new Error(UNAVAILABLE)); } catch { /* Discard uncertain connection. */ }
      }
    }
  }
  private async one<T extends QueryResultRow>(client: PoolClient, sql: string, values: readonly unknown[]): Promise<T> {
    const result = await client.query<T>(sql, [...values]);
    if (result.command !== 'SELECT' || result.rowCount !== 1 || result.rows.length !== 1) fail();
    return result.rows[0]!;
  }
  private async bool(client: PoolClient, sql: string, values: readonly unknown[]): Promise<boolean> {
    const row = await this.one<{ value: boolean }>(client, sql, values);
    if (typeof row.value !== 'boolean') fail();
    return row.value;
  }
  private scope(w: Witness): unknown[] {
    return [w.keyH, w.ownerH, w.authorityH, w.requestH, w.nonceH, w.bindingH,
      w.origin, w.chain, w.epoch, w.manifestH, this.now()];
  }
  private async witness(web: EnrollmentWeb, key: string, operation: Operation,
    requestParts: readonly string[], purpose: 'enroll_identifier' | 'otp_step_up' | 'session'): Promise<Witness> {
    if (typeof key !== 'string' || !KEY.test(key)) fail();
    const w = this.web(web);
    const lookup = await this.tx('subtrack_auth_producer', async client => {
      const row = await this.one<{ value: string | null }>(client,
        'SELECT subtrack_auth.peek($1::subtrack_auth.h,$2::subtrack_auth.h,$3::text,$4::text,$5::subtrack_auth.h,$6::subtrack_auth.ms,$7::text) AS value',
        [w.nonceH, w.bindingH, this.origin, this.epoch, this.manifestH, this.now(), purpose]);
      if (typeof row.value !== 'string' || !CHAIN.test(row.value) ||
        w.chainHint !== '' && w.chainHint !== row.value) fail();
      return row.value;
    });
    const chain = lookup.state === 'committed' && typeof lookup.value === 'string' ? lookup.value : fail();
    return Object.freeze({
      keyH: this.h('idempotency', 'global-key', [key]),
      ownerH: this.h('idempotency', 'owner', [secret(), operation]),
      authorityH: this.h('authority', 'browser', [this.origin, w.bindingH, chain]),
      requestH: this.h('request', operation, requestParts),
      nonceH: w.nonceH, bindingH: w.bindingH, sessionBindingH: w.sessionBindingH, origin: this.origin,
      chain, epoch: this.epoch, manifestH: this.manifestH,
    });
  }
  private async reserve(w: Witness, operation: Operation): Promise<void> {
    const result = await this.tx('subtrack_auth_producer', async client => {
      const row = await this.one<{ value: string | null }>(client,
        'SELECT subtrack_auth.reserve_enrollment($1::subtrack_auth.h,$2::subtrack_auth.h,$3::subtrack_auth.h,$4::subtrack_auth.h,$5::text,$6::text,$7::text,$8::subtrack_auth.h,$9::subtrack_auth.ms) AS value',
        [w.keyH, w.ownerH, w.authorityH, w.requestH, operation, w.origin, w.epoch, w.manifestH, this.now()]);
      if (typeof row.value !== 'string' || !/^[1-9][0-9]*$/.test(row.value) || BigInt(row.value) > BigInt(Number.MAX_SAFE_INTEGER)) fail();
    });
    if (result.state !== 'committed') fail();
  }
  private async failedBurn(w: Witness): Promise<void> {
    try {
      await this.tx('subtrack_auth_producer', async client =>
        this.bool(client, `SELECT subtrack_auth.fail_enrollment_burn(${SCOPE}) AS value`, this.scope(w)));
    } catch { /* Burn remains spent even if settlement cannot be confirmed. */ }
  }
  private async operate<T>(w: Witness, role: Role, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const result = await this.tx(role, work);
    if (result.state === 'committed') return result.value;
    if (result.state === 'rolledBack') await this.failedBurn(w);
    return fail();
  }
  private async transition(client: PoolClient, name: string, w: Witness, extra: readonly unknown[], types: readonly string[]): Promise<boolean> {
    const placeholders = types.map((type, index) => `$${index + 12}::${type}`).join(',');
    return this.bool(client, `SELECT subtrack_auth.${name}(${SCOPE},${placeholders}) AS value`,
      [...this.scope(w), ...extra]);
  }
  async startOtp(web: EnrollmentWeb, input: Readonly<{ identifier: string; channel: 'email' | 'sms'; purpose: 'enroll_identifier' }>, key: string):
    Promise<Readonly<{ challengeId: string; expiresAt: number; nextBrowserNonce: string }>> {
    try {
      const request = own(input, ['identifier', 'channel', 'purpose']);
      if (request.purpose !== 'enroll_identifier' || (request.channel !== 'email' && request.channel !== 'sms') ||
        typeof request.identifier !== 'string') fail();
      const normalized = normalizeIdentifier(request.channel === 'sms' ? 'phone' : 'email', request.identifier as string);
      const contact = normalized.valid ? normalized.identifier : fail();
      const channel = request.channel as 'email' | 'sms';
      const code = this.developmentOtpCode();
      if (typeof code !== 'string' || !CODE.test(code)) fail();
      const w = await this.witness(web, key, 'startV2Otp', [channel, contact, 'enroll_identifier'], 'enroll_identifier');
      await this.reserve(w, 'startV2Otp');
      const challengeId = secret(), nextBrowserNonce = secret();
      const expiresAt = this.now() + TTL;
      if (!Number.isSafeInteger(expiresAt) || expiresAt > MAX_TIME) fail();
      const ok = await this.operate(w, 'subtrack_auth_producer', client =>
        this.transition(client, 'issue_enrollment_otp', w, [
          this.h('otp', 'challenge', [challengeId]), this.h('otp', 'code', [code]),
          this.h('otp', 'identifier', [contact]), contact, channel, sha('nonce', nextBrowserNonce), expiresAt, w.sessionBindingH,
        ], ['subtrack_auth.h', 'subtrack_auth.h', 'subtrack_auth.h', 'text', 'text', 'subtrack_auth.h', 'subtrack_auth.ms', 'subtrack_auth.h']));
      if (!ok || this.now() >= expiresAt) fail();
      return Object.freeze({ challengeId, expiresAt, nextBrowserNonce });
    } catch { return fail(); }
  }
  async verifyOtp(web: EnrollmentWeb, input: Readonly<{ challengeId: string; code: string }>, key: string):
    Promise<Readonly<{ proof: string; nextBrowserNonce: string }>> {
    try {
      const request = own(input, ['challengeId', 'code']);
      if (!canonical(request.challengeId) || typeof request.code !== 'string' || !CODE.test(request.code)) fail();
      const w = await this.witness(web, key, 'verifyV2Otp', [request.challengeId as string, request.code as string], 'otp_step_up');
      await this.reserve(w, 'verifyV2Otp');
      const proof = secret(), nextBrowserNonce = secret();
      // False is a durable wrong-code transition (including terminal attempt five): COMMIT it before outward failure.
      const ok = await this.operate(w, 'subtrack_auth_producer', client =>
        this.transition(client, 'verify_enrollment_otp', w, [
          this.h('otp', 'challenge', [request.challengeId as string]), this.h('otp', 'code', [request.code as string]),
          this.h('proof', 'restricted-enrollment', [proof]), sha('nonce', nextBrowserNonce),
        ], ['subtrack_auth.h', 'subtrack_auth.h', 'subtrack_auth.h', 'subtrack_auth.h']));
      if (!ok) fail();
      return Object.freeze({ proof, nextBrowserNonce });
    } catch { return fail(); }
  }
  async admit(web: EnrollmentWeb, input: Readonly<{ proof: string }>, key: string):
    Promise<Readonly<{ pending: string; nextBrowserNonce: string }>> {
    try {
      const request = own(input, ['proof']);
      if (!canonical(request.proof)) fail();
      const w = await this.witness(web, key, 'admitEnrollment', [request.proof as string], 'otp_step_up');
      await this.reserve(w, 'admitEnrollment');
      const pending = secret(), nextBrowserNonce = secret();
      const ok = await this.operate(w, 'subtrack_runtime', client =>
        this.transition(client, 'admit_enrollment', w, [
          this.h('proof', 'restricted-enrollment', [request.proof as string]),
          this.h('proof', 'pending', [pending]), sha('nonce', nextBrowserNonce),
        ], ['subtrack_auth.h', 'subtrack_auth.h', 'subtrack_auth.h']));
      if (!ok) fail();
      return Object.freeze({ pending, nextBrowserNonce });
    } catch { return fail(); }
  }
  async verifyPerson(web: EnrollmentWeb, input: Readonly<{ pending: string }>, key: string):
    Promise<Readonly<{ verified: string; nextBrowserNonce: string }>> {
    try {
      const request = own(input, ['pending']);
      if (!canonical(request.pending)) fail();
      const w = await this.witness(web, key, 'verifyEnrollmentPerson', [request.pending as string], 'otp_step_up');
      await this.reserve(w, 'verifyEnrollmentPerson');
      const pendingH = this.h('proof', 'pending', [request.pending as string]);
      const preflight = await this.operate(w, 'subtrack_auth_producer', client =>
        this.transition(client, 'pending_enrollment', w, [pendingH], ['subtrack_auth.h']));
      if (!preflight) fail();
      const person = await this.verifyPersonEvidence();
      const result = own(person, ['method', 'personnummerHmac', 'verifiedAt', 'givenName', 'surname']);
      if (result.method !== 'BANKID' || typeof result.personnummerHmac !== 'string' ||
        !HEX.test(result.personnummerHmac) || typeof result.verifiedAt !== 'string' ||
        new Date(result.verifiedAt).toISOString() !== result.verifiedAt ||
        typeof result.givenName !== 'string' || typeof result.surname !== 'string' ||
        result.givenName.length === 0 || result.surname.length === 0 ||
        Date.parse(result.verifiedAt) > this.now() || this.now() - Date.parse(result.verifiedAt) > TTL) fail();
      const verified = secret(), nextBrowserNonce = secret();
      const ok = await this.operate(w, 'subtrack_auth_producer', client =>
        this.transition(client, 'verify_enrollment_person', w, [
          pendingH, this.h('person', 'verified', [verified]), sha('nonce', nextBrowserNonce),
          this.h('person', 'subject', [result.personnummerHmac as string]),
          result.verifiedAt, result.givenName, result.surname,
        ], ['subtrack_auth.h', 'subtrack_auth.h', 'subtrack_auth.h', 'subtrack_auth.h', 'text', 'text', 'text']));
      if (!ok) fail();
      return Object.freeze({ verified, nextBrowserNonce });
    } catch { return fail(); }
  }
  async complete(web: EnrollmentWeb, input: Readonly<{ verified: string }>, key: string, privateLocaleHint?: string):
    Promise<Readonly<{ identityId: string; sessionId: string; refreshToken: string; csrfToken: string; browserChainId: string; profile: EnrollmentProfileView }>> {
    try {
      const request = own(input, ['verified']);
      if (!canonical(request.verified) || (privateLocaleHint !== undefined && typeof privateLocaleHint !== 'string')) fail();
      const w = await this.witness(web, key, 'completeEnrollment', [request.verified as string], 'session');
      await this.reserve(w, 'completeEnrollment');
      const verifiedH = this.h('person', 'verified', [request.verified as string]);
      const identityId = randomUUID(), sessionId = randomUUID(), familyId = randomUUID();
      if (![identityId, sessionId, familyId].every(value => UUID.test(value))) fail();
      const refreshToken = `v2r.${secret()}`;
      const csrf = mintDurableSessionCsrf();
      const csrfToken = csrf.token;
      const refreshH = createHash('sha256').update('subtrack:auth-refresh:v2:', 'utf8').update(refreshToken, 'utf8').digest('hex');
      const csrfH = csrf.digest;
      const profile: EnrollmentProfileView = Object.freeze({ displayName: null, avatarColourToken: null, avatarEmoji: null,
        language: typeof privateLocaleHint === 'string' && /^sv(?:-|$)/i.test(privateLocaleHint) ? 'sv' : 'en',
        theme: 'system', defaultCurrency: 'SEK', profileComplete: false });
      let loginRequired = false;
      const result = await this.tx('subtrack_runtime', async client => {
        const material = await this.one<{ subject_h: string; channel: string; contact: string; verified_at: string; given_name: string; surname: string }>(
          client, `SELECT * FROM subtrack_auth.terminal_enrollment(${SCOPE},$12::subtrack_auth.h,$13::subtrack_auth.h)`,
          [...this.scope(w), verifiedH, w.nonceH]);
        if (!HEX.test(material.subject_h) || !['email', 'sms'].includes(material.channel) ||
          typeof material.contact !== 'string' || material.contact.length === 0 ||
          typeof material.verified_at !== 'string' || typeof material.given_name !== 'string' ||
          typeof material.surname !== 'string') fail();
        const locks = [this.h('person', 'subject-lock', [material.subject_h]),
          this.h('person', 'contact-lock', [material.channel, material.contact])].sort();
        for (const lock of locks) await this.one(client,
          'SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1::text,0)) AS locked', [lock]);
        await this.role(client, 'subtrack_identity_provisioner');
        const existing = await client.query<{ id: string; external_id: string }>(
          'SELECT id,external_id FROM public.identity WHERE external_id=$1::text', [material.subject_h]);
        if (existing.rows.length > 1) fail();
        if (existing.rows.length === 1) {
          const priorId = existing.rows[0]!.id;
          await this.role(client, 'subtrack_runtime');
          await client.query(`SELECT set_config('app.user_id',$1,true),set_config('app.current_user_id',$1,true)`, [priorId]);
          const prior = await client.query<{ deleted_at: Date | null }>(
            'SELECT deleted_at FROM public.identity WHERE id=$1::uuid FOR UPDATE', [priorId]);
          if (prior.rows.length === 1 && prior.rows[0]!.deleted_at === null) loginRequired = true;
          fail();
        }
        const inserted = await client.query<{ id: string }>(
          "INSERT INTO public.identity(id,external_id,auth_method,updated_at) VALUES($1::uuid,$2::text,'BANKID',pg_catalog.clock_timestamp()) RETURNING id",
          [identityId, material.subject_h]);
        if (inserted.rowCount !== 1 || inserted.rows[0]?.id !== identityId) fail();
        await this.role(client, 'subtrack_runtime');
        await client.query(`SELECT set_config('app.user_id',$1,true),set_config('app.current_user_id',$1,true)`, [identityId]);
        const owner = await client.query<{ id: string }>(
          'SELECT id FROM public.identity WHERE id=$1::uuid AND deleted_at IS NULL FOR UPDATE', [identityId]);
        if (owner.rows.length !== 1 || owner.rows[0]?.id !== identityId) fail();
        const updated = await client.query(
          `UPDATE public.identity SET email=CASE WHEN $2::text='email' THEN $3::text ELSE NULL END,
          phone=CASE WHEN $2::text='sms' THEN $3::text ELSE NULL END,
          verified_at=$4::timestamptz,given_name=$5::text,surname=$6::text,updated_at=clock_timestamp()
          WHERE id=$1::uuid AND deleted_at IS NULL`,
          [identityId, material.channel, material.contact, material.verified_at, material.given_name, material.surname]);
        if (updated.rowCount !== 1) fail();
        const createdProfile = await client.query(
          `INSERT INTO public.identity_profile(identity_id,display_name,avatar_color,avatar_emoji,language,theme,default_currency,profile_complete)
          VALUES($1::uuid,NULL,NULL,NULL,$2::text,'system','SEK',false)`, [identityId, profile.language]);
        if (createdProfile.rowCount !== 1) fail();
        if (!await this.transition(client, 'bind_enrollment_identity', w,
          [verifiedH, w.nonceH, identityId], ['subtrack_auth.h', 'subtrack_auth.h', 'uuid'])) fail();
        if (!await this.transition(client, 'issue_enrollment_session', w,
          [verifiedH, w.nonceH, identityId, sessionId, familyId, refreshH, csrfH],
          ['subtrack_auth.h', 'subtrack_auth.h', 'uuid', 'uuid', 'uuid', 'subtrack_auth.h', 'subtrack_auth.h'])) fail();
        if (!await this.transition(client, 'consume_enrollment', w,
          [verifiedH, w.nonceH], ['subtrack_auth.h', 'subtrack_auth.h'])) fail();
      });
      if (result.state !== 'committed') {
        if (result.state === 'rolledBack') await this.failedBurn(w);
        if (result.state === 'rolledBack' && loginRequired) throw new Error(LOGIN_REQUIRED);
        fail();
      }
      return Object.freeze({ identityId, sessionId, refreshToken, csrfToken, browserChainId: w.chain, profile });
    } catch (error) {
      if (error instanceof Error && error.message === LOGIN_REQUIRED) throw error;
      return fail();
    }
  }
}
