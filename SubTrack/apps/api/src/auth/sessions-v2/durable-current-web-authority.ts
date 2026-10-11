import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { hashBrowserBindingCookie } from './v2-web-session-binding.js';
import type { V2AccessToken } from './v2-access-token.js';
import { hashDurableSessionCsrf, mintDurableSessionCsrf } from '../session-csrf/durable-session-csrf.js';

const UNAVAILABLE = 'Current web session unavailable';
const DIGEST = /^[a-f0-9]{64}$/;
const CHAIN = /^[A-Za-z0-9_-]{1,256}$/;
const ROLE = 'subtrack_dev_auth_login';
const BUSINESS_SQL = /^(?:SELECT\b|INSERT\s+INTO\b|UPDATE\b|DELETE\s+FROM\b)/i;
const OPERATION = /^[A-Za-z][A-Za-z0-9_]*$/;
const FORBIDDEN_SQL = /;|--|\/\*|\*\/|["'`]|\b(?:set_config|current_setting|setval|setrole|set_role|pg_advisory|dblink|copy|execute|prepare|deallocate|begin|commit|rollback|savepoint|reset|discard|listen|notify|security_definer)\b/i;

export type CurrentWebRequest = Readonly<{
  accessToken: string;
  exactOrigin: string;
  bindingCookie: string;
  browserChainId: string;
  csrfToken: string;
}>;

export type CurrentWebOwner = Readonly<{ identityId: string; sessionId: string }>;

/** Only server-composition-owned named statements are available during the callback. */
export interface OwnerTx {
  execute<R extends QueryResultRow = QueryResultRow>(operationName: string, values: readonly unknown[]): Promise<QueryResult<R>>;
}

export type DurableCurrentWebConfig = Readonly<{
  pool: Pick<Pool, 'connect'>;
  accessTokens: V2AccessToken;
  origin: string;
  database?: string;
  epoch: string;
  manifestHash: string;
  /** Audited parameterized SQL literals supplied by trusted server composition, never request data. */
  businessStatements: Readonly<Record<string, string>>;
  observedMs?: (() => number) | undefined;
}>;

function unavailable(): never { throw new Error(UNAVAILABLE); }

function observed(clock: () => number): number {
  const value = clock();
  if (!Number.isSafeInteger(value) || value < 0) unavailable();
  return value;
}

function clean(row: QueryResultRow | undefined, database: string): boolean {
  return row?.session_user === ROLE && row.current_user === ROLE &&
    row.database_name === database &&
    (row.user_id === null || row.user_id === '') &&
    (row.current_user_id === null || row.current_user_id === '');
}

const CLEAN_SQL = `SELECT session_user::text AS session_user, current_user::text AS current_user,
  pg_catalog.current_database()::text AS database_name,
  pg_catalog.current_setting('app.user_id', true) AS user_id,
  pg_catalog.current_setting('app.current_user_id', true) AS current_user_id`;

/** No session-level role or GUC state may be carried between requests. */
export async function assertCleanCurrentWebConnection(client: PoolClient, database = 'st233a_development_auth_foundation_proof'): Promise<void> {
  const state = await client.query(CLEAN_SQL);
  if (state.rows.length !== 1 || !clean(state.rows[0], database)) unavailable();
}

async function assertTransactionDatabase(client: PoolClient, database: string): Promise<void> {
  const result = await client.query<{ database_name: string }>('SELECT pg_catalog.current_database()::text AS database_name');
  if (result.command !== 'SELECT' || result.rows.length !== 1 || result.rows[0]?.database_name !== database) unavailable();
}

type Witness = Readonly<{
  identityId: string; sessionId: string; origin: string; chain: string;
  bindingHash: string; csrfHash: string; accessToken: string;
}>;

export class DurableCurrentWebAuthority {
  private readonly config: DurableCurrentWebConfig;
  private readonly clock: () => number;
  private readonly verifyToken: V2AccessToken['verify'];
  private readonly businessStatements: Readonly<Record<string, string>>;

  constructor(config: DurableCurrentWebConfig) {
    const oldTuple = config.origin === 'https://st233a.invalid' &&
      (config.database === undefined || config.database === 'st233a_development_auth_foundation_proof');
    const privateTuple = config.origin === 'https://localhost:3443' &&
      config.database === 'st237_private_https_profile' && config.epoch === 'st237_private_https_v1';
    if (process.env.NODE_ENV !== 'development' || !(oldTuple || privateTuple) ||
      !config.epoch || !DIGEST.test(config.manifestHash) ||
      !config.pool || typeof config.pool.connect !== 'function' || !config.accessTokens ||
      typeof config.accessTokens.verify !== 'function' ||
      (config.observedMs !== undefined && typeof config.observedMs !== 'function')) unavailable();
    if (!config.businessStatements || typeof config.businessStatements !== 'object') unavailable();
    const statements: Record<string, string> = Object.create(null) as Record<string, string>;
    for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(config.businessStatements))) {
      const sql: unknown = descriptor.value;
      if (!OPERATION.test(name) || !('value' in descriptor) || typeof sql !== 'string' ||
        !BUSINESS_SQL.test(sql.trimStart()) || FORBIDDEN_SQL.test(sql)) unavailable();
      statements[name] = sql;
    }
    this.businessStatements = Object.freeze(statements);
    this.config = Object.freeze({ ...config, pool: Object.freeze({ connect: config.pool.connect.bind(config.pool) }) });
    this.clock = config.observedMs ?? Date.now;
    this.verifyToken = config.accessTokens.verify.bind(config.accessTokens);
  }

  private witness(request: CurrentWebRequest): Witness {
    try {
      if (request.exactOrigin !== this.config.origin || !CHAIN.test(request.browserChainId)) unavailable();
      const claims = this.verifyToken(request.accessToken);
      return Object.freeze({
        identityId: claims.sub, sessionId: claims.sid, origin: request.exactOrigin,
        chain: request.browserChainId, bindingHash: hashBrowserBindingCookie(request.bindingCookie),
        csrfHash: hashDurableSessionCsrf(request.csrfToken), accessToken: request.accessToken,
      });
    } catch { return unavailable(); }
  }

  private async fence(client: PoolClient): Promise<void> {
    const result = await client.query<{ ok: boolean }>(
      'SELECT subtrack_auth.fence($1::text,$2::subtrack_auth.h,$3::subtrack_auth.ms) AS ok',
      [this.config.epoch, this.config.manifestHash, observed(this.clock)],
    );
    if (result.rows.length !== 1 || result.rows[0]?.ok !== true) unavailable();
  }

  private async check(client: PoolClient, witness: Witness, operation: 'check_current_web' | 'replace_current_csrf' | 'revoke_current', nextHash?: string): Promise<void> {
    this.verifyToken(witness.accessToken);
    const args: unknown[] = [witness.identityId, witness.sessionId, witness.origin, witness.chain,
      witness.bindingHash, witness.csrfHash, this.config.epoch, this.config.manifestHash, observed(this.clock)];
    if (nextHash !== undefined) args.push(nextHash);
    const placeholders = ['$1::uuid','$2::uuid','$3::text','$4::text','$5::subtrack_auth.h',
      '$6::subtrack_auth.h','$7::text','$8::subtrack_auth.h','$9::subtrack_auth.ms'];
    if (nextHash !== undefined) placeholders.push('$10::subtrack_auth.h');
    const result = await client.query<{ ok: boolean }>(
      `SELECT subtrack_auth.${operation}(${placeholders.join(',')}) AS ok`, args,
    );
    if (result.rows.length !== 1 || result.rows[0]?.ok !== true) unavailable();
  }

  private async transact<T>(request: CurrentWebRequest, action: (client: PoolClient, witness: Witness) => Promise<T>): Promise<T> {
    if (process.env.NODE_ENV !== 'development') unavailable();
    const witness = this.witness(request);
    let client: PoolClient | undefined;
    let begun = false;
    let commitAttempted = false;
    let released = false;
    try {
      client = await this.config.pool.connect();
      await assertCleanCurrentWebConnection(client, this.config.database);
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      begun = true;
      await client.query('SET LOCAL ROLE subtrack_runtime');
      await this.fence(client);
      await assertTransactionDatabase(client, this.config.database ?? 'st233a_development_auth_foundation_proof');
      await client.query(`SELECT pg_catalog.set_config('app.user_id',$1,true),
        pg_catalog.set_config('app.current_user_id',$1,true)`, [witness.identityId]);
      const owner = await client.query('SELECT id FROM public.identity WHERE id=$1::uuid AND deleted_at IS NULL FOR UPDATE', [witness.identityId]);
      if (owner.rows.length !== 1) unavailable();
      this.verifyToken(witness.accessToken);
      const result = await action(client, witness);
      await this.fence(client);
      await assertTransactionDatabase(client, this.config.database ?? 'st233a_development_auth_foundation_proof');
      this.verifyToken(witness.accessToken);
      commitAttempted = true;
      const commit = await client.query('COMMIT');
      if (commit.command !== 'COMMIT') unavailable();
      await assertCleanCurrentWebConnection(client, this.config.database);
      client.release();
      released = true;
      return result;
    } catch {
      if (client && begun && !commitAttempted) {
        try { await client.query('ROLLBACK'); } catch { /* discarded below */ }
      }
      return unavailable();
    } finally {
      if (client && !released) {
        try {
          client.release(new Error(UNAVAILABLE));
        } catch { /* release failures cannot disclose a result */ }
      }
    }
  }

  async withCurrentWebAuthority<T>(request: CurrentWebRequest, write: (tx: OwnerTx, owner: CurrentWebOwner) => Promise<T>): Promise<T> {
    return this.transact(request, async (client, witness) => {
      await this.check(client, witness, 'check_current_web');
      let active = true;
      let pending = 0;
      const tx: OwnerTx = Object.freeze({
        execute: async <R extends QueryResultRow = QueryResultRow>(operationName: string, values: readonly unknown[]): Promise<QueryResult<R>> => {
          if (!active || typeof operationName !== 'string' || !Object.hasOwn(this.businessStatements, operationName) ||
            !Array.isArray(values)) unavailable();
          pending += 1;
          try { return await client.query<R>(this.businessStatements[operationName]!, [...values]); }
          finally { pending -= 1; }
        },
      });
      let result: T;
      try { result = await write(tx, Object.freeze({ identityId: witness.identityId, sessionId: witness.sessionId })); }
      finally { active = false; }
      if (pending !== 0) unavailable();
      await this.check(client, witness, 'check_current_web');
      return result;
    });
  }

  async replaceCurrentCsrf(request: CurrentWebRequest): Promise<string> {
    return this.transact(request, async (client, witness) => {
      const next = mintDurableSessionCsrf();
      await this.check(client, witness, 'replace_current_csrf', next.digest);
      return next.token;
    });
  }

  async revokeCurrent(request: CurrentWebRequest): Promise<void> {
    return this.transact(request, async (client, witness) => {
      await this.check(client, witness, 'revoke_current');
    });
  }
}
