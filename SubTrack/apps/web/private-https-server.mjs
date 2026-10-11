// ST-237 opt-in development-only composition. No default API module or second listener is loaded.
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import process from 'node:process';
import { X509Certificate } from 'node:crypto';
import { TLSSocket } from 'node:tls';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const webDir = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(webDir, '../api');
const webRequire = createRequire(path.join(webDir, 'package.json'));
const apiRequire = createRequire(path.join(apiDir, 'package.json'));
const fail = () => { throw new Error('Private HTTPS unavailable'); };
const env = process.env;
if (env.NODE_ENV !== 'development' || !env.ST237_PRIVATE_CONFIG ||
  !/^[a-f0-9]{48}$/.test(env.ST237_PG_PASSWORD ?? '') ||
  !/^[1-9][0-9]{0,4}$/.test(env.ST237_PG_PORT ?? '') ||
  Number(env.ST237_PG_PORT) > 65535 || !env.ST237_LEAF_KEY || !env.ST237_LEAF_CHAIN) fail();
env.ST237_PRIVATE_HTTPS = '1';
const key = fs.readFileSync(env.ST237_LEAF_KEY);
const cert = fs.readFileSync(env.ST237_LEAF_CHAIN);
const leaf = new X509Certificate(cert);
if (!leaf.subjectAltName?.split(', ').includes('DNS:localhost') ||
  !leaf.checkPrivateKey(apiRequire('node:crypto').createPrivateKey(key))) fail();

apiRequire('reflect-metadata');
const { NestFactory } = apiRequire('@nestjs/core');
const { ExpressAdapter } = apiRequire('@nestjs/platform-express');
const { Controller, Module, Post, Patch, Req, Res } = apiRequire('@nestjs/common');
const express = createRequire(apiRequire.resolve('@nestjs/platform-express'))('express');
const next = webRequire('next');
const { Pool } = apiRequire('pg');
const { loadPrivateAuthEpoch } = apiRequire('./dist/auth/private-auth-epoch.js');
const { createDevelopmentBootstrapPostgresPort } = apiRequire('./dist/auth/browser-nonce/development-bootstrap-postgres-port.js');
const { createDevelopmentBootstrapTransaction } = apiRequire('./dist/auth/browser-nonce/development-bootstrap-transaction.js');
const { DevelopmentEnrollmentPersonVerifier } = apiRequire('./dist/auth/identity-provider/development-enrollment-person-verifier.js');
const { DurableDevelopmentEnrollment } = apiRequire('./dist/auth/enrollment-v2/durable-development-enrollment.js');
const { V2AccessToken } = apiRequire('./dist/auth/sessions-v2/v2-access-token.js');
const { DurableCurrentWebAuthority } = apiRequire('./dist/auth/sessions-v2/durable-current-web-authority.js');
const { PRIVATE_PROFILE_STATEMENTS } = apiRequire('./dist/profile/private-profile-statements.js');
const { createPrivateEnrollmentHttp, privateProblem, privateJson } = apiRequire('./dist/auth/enrollment-v2/private-enrollment-http.js');
const { createPrivateProfileHttp } = apiRequire('./dist/profile/private-profile-http.js');
const epoch = loadPrivateAuthEpoch(env.ST237_PRIVATE_CONFIG);
const port = Number(env.ST237_PG_PORT);
const pool = new Pool({ host: '127.0.0.1', port, database: epoch.database, user: epoch.login,
  password: env.ST237_PG_PASSWORD, ssl: false, max: 4, connectionTimeoutMillis: 3000,
  query_timeout: 3000, statement_timeout: 2000, lock_timeout: 1000,
  idle_in_transaction_session_timeout: 4000, application_name: 'st237-private' });
pool.on('error', () => {});

async function assertStartup() {
  const client = await pool.connect();
  try {
    const state = await client.query(`SELECT pg_catalog.current_database()::text AS database_name,
      session_user::text AS session_user, current_user::text AS current_user,
      pg_catalog.current_setting('app.user_id',true) AS user_id,
      pg_catalog.current_setting('app.current_user_id',true) AS current_user_id,
      pg_catalog.to_regclass('public.identity_profile')::text AS profile_table,
      pg_catalog.to_regclass('subtrack_auth.epoch')::text AS epoch_table`);
    const row = state.rows[0];
    if (state.rowCount !== 1 || row.database_name !== epoch.database || row.session_user !== epoch.login ||
      row.current_user !== epoch.login || ![null, ''].includes(row.user_id) || ![null, ''].includes(row.current_user_id) ||
      row.profile_table !== 'identity_profile' && row.profile_table !== 'public.identity_profile' ||
      row.epoch_table !== 'subtrack_auth.epoch') fail();
    const requiredFunctions = ['fence','peek','reserve_bootstrap','settle_bootstrap','issue_bootstrap_nonce',
      'check_current_web','reserve_enrollment','issue_enrollment_otp','verify_enrollment_otp',
      'admit_enrollment','pending_enrollment','verify_enrollment_person','terminal_enrollment',
      'bind_enrollment_identity','issue_enrollment_session','consume_enrollment','fail_enrollment_burn'];
    const functionCatalog = await client.query(`SELECT p.proname::text AS name,
      p.prosecdef AS security_definer, r.rolname::text AS owner
      FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
      WHERE n.nspname='subtrack_auth' AND p.proname=ANY($1::text[])`, [requiredFunctions]);
    if (functionCatalog.rows.length !== requiredFunctions.length ||
      functionCatalog.rows.some(item => !requiredFunctions.includes(item.name) ||
        item.security_definer !== true || item.owner !== 'subtrack_auth_executor') ||
      new Set(functionCatalog.rows.map(item => item.name)).size !== requiredFunctions.length) fail();
    const rls = await client.query(`SELECT n.nspname::text AS schema_name,c.relname::text AS table_name,
      c.relrowsecurity AS enabled,c.relforcerowsecurity AS forced
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE (n.nspname='subtrack_auth' AND c.relname=ANY($1::text[]))
         OR (n.nspname='public' AND c.relname='identity_profile')`,
      [['epoch','reservation','nonce','family','session','credential','csrf','otp','restricted_proof',
        'pending_enrollment','verified_enrollment','enrollment_intent','identity_birth']]);
    if (rls.rows.length !== 14 || rls.rows.some(item => item.enabled !== true || item.forced !== true)) fail();
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    await client.query('SET LOCAL ROLE subtrack_runtime');
    const fence = await client.query('SELECT subtrack_auth.fence($1::text,$2::subtrack_auth.h,$3::subtrack_auth.ms) AS ok',
      [epoch.epoch, epoch.manifestHash, Date.now()]);
    if (fence.rows.length !== 1 || fence.rows[0].ok !== true) fail();
    await client.query('COMMIT');
    const after = await client.query(`SELECT pg_catalog.current_database()::text AS database_name,
      session_user::text AS session_user, current_user::text AS current_user,
      pg_catalog.current_setting('app.user_id',true) AS user_id,
      pg_catalog.current_setting('app.current_user_id',true) AS current_user_id`);
    if (after.rows.length !== 1 || after.rows[0].database_name !== epoch.database ||
      after.rows[0].session_user !== epoch.login || after.rows[0].current_user !== epoch.login ||
      ![null, ''].includes(after.rows[0].user_id) || ![null, ''].includes(after.rows[0].current_user_id)) fail();
  } finally { client.release(); }
}

async function main() {
  await assertStartup();
  const tokens = new V2AccessToken({ environment: 'development', enabled: true,
    ...epoch.accessKeyPair, clock: Date.now });
  const verifier = new DevelopmentEnrollmentPersonVerifier({ environment: 'development', enabled: true,
    simulatorHmacKey: epoch.simulatorHmacKey, clock: Date.now });
  const enrollment = new DurableDevelopmentEnrollment({ environment: 'development', enabled: true,
    origin: epoch.origin, database: epoch.database, epoch: epoch.epoch, manifestHash: epoch.manifestHash,
    pool, clock: Date.now, verifier, keys: epoch.enrollmentKeys, developmentOtpCode: () => '123456' });
  const authority = new DurableCurrentWebAuthority({ pool, accessTokens: tokens, origin: epoch.origin,
    database: epoch.database, epoch: epoch.epoch, manifestHash: epoch.manifestHash,
    businessStatements: PRIVATE_PROFILE_STATEMENTS });
  const bootstrap = () => createDevelopmentBootstrapTransaction({ enabled: true, origin: epoch.origin,
    epoch: epoch.epoch, manifestHash: epoch.manifestHash, retentionMs: 86_400_000,
    idempotencyKey: epoch.bootstrapKeys.idempotencyKey, originKey: epoch.bootstrapKeys.originKey },
    createDevelopmentBootstrapPostgresPort({ enabled: true, origin: epoch.origin,
      epoch: epoch.epoch, manifestHash: epoch.manifestHash, database: epoch.database,
      password: env.ST237_PG_PASSWORD, port }));
  const auth = createPrivateEnrollmentHttp({ bootstrap, enrollment, accessTokens: tokens });
  const profile = createPrivateProfileHttp(authority);
  class PrivateController {
    async profileRead(req, res) { await profile.handle(req, res); }
    async profilePatch(req, res) { await profile.handle(req, res); }
  }
  Controller('v2')(PrivateController);
  for (const [index, route] of ['auth/browser-nonce', 'auth/otp/start', 'auth/otp/verify',
    'auth/enrollment/pending', 'auth/enrollment/simulator/verify', 'auth/enrollment/complete'].entries()) {
    const method = `auth${index}`;
    Object.defineProperty(PrivateController.prototype, method, { value: async (req, res) => auth.handle(req, res) });
    Post(route)(PrivateController.prototype, method, Object.getOwnPropertyDescriptor(PrivateController.prototype, method));
    Req()(PrivateController.prototype, method, 0); Res()(PrivateController.prototype, method, 1);
  }
  Post('me/profile/read')(PrivateController.prototype, 'profileRead', Object.getOwnPropertyDescriptor(PrivateController.prototype, 'profileRead'));
  Patch('me/profile')(PrivateController.prototype, 'profilePatch', Object.getOwnPropertyDescriptor(PrivateController.prototype, 'profilePatch'));
  Req()(PrivateController.prototype, 'profileRead', 0); Res()(PrivateController.prototype, 'profileRead', 1);
  Req()(PrivateController.prototype, 'profilePatch', 0); Res()(PrivateController.prototype, 'profilePatch', 1);
  class PrivateModule {}
  Module({ controllers: [PrivateController] })(PrivateModule);
  const api = express();
  const nest = await NestFactory.create(PrivateModule, new ExpressAdapter(api), { logger: false, bodyParser: false });
  await nest.init();
  const nextApp = next({ dev: true, dir: webDir, hostname: 'localhost', port: 3443 });
  await nextApp.prepare();
  const web = nextApp.getRequestHandler();
  const routes = new Set(['/v2/auth/browser-nonce','/v2/auth/otp/start','/v2/auth/otp/verify',
    '/v2/auth/enrollment/pending','/v2/auth/enrollment/simulator/verify','/v2/auth/enrollment/complete',
    '/v2/me/profile/read','/v2/me/profile']);
  const server = https.createServer({ key, cert }, (req, res) => {
    if (!(req.socket instanceof TLSSocket) || !req.socket.encrypted ||
      req.socket.remoteAddress !== '127.0.0.1' || req.headers.host !== 'localhost:3443') {
      res.writeHead(421, { 'Cache-Control': 'no-store', Pragma: 'no-cache' }).end(); return;
    }
    if (req.url === '/v2' || req.url?.startsWith('/v2/')) {
      res.setHeader('Cache-Control', 'no-store'); res.setHeader('Pragma', 'no-cache');
      const profilePath = req.url.startsWith('/v2/me/profile');
      const expectedMethod = req.url === '/v2/me/profile' ? 'PATCH' : 'POST';
      if (!routes.has(req.url) || req.method !== expectedMethod) {
        if (profilePath) privateJson(res, 400, { type: 'about:blank', title: 'Bad Request', status: 400, code: 'INVALID_PROFILE_REQUEST' }, true);
        else privateProblem(res, routes.has(req.url) ? 400 : 404);
        return;
      }
      api(req, res); return;
    }
    Promise.resolve(web(req, res)).catch(() => { if (!res.headersSent) res.writeHead(500).end(); });
  });
  server.listen(3443, '127.0.0.1', () => process.stdout.write('ST237_PRIVATE_HTTPS_READY\n'));
  const close = async () => { server.close(); server.closeAllConnections(); await nest.close(); await nextApp.close(); await pool.end(); };
  process.once('SIGTERM', () => { void close().finally(() => process.exit(0)); });
  process.once('SIGINT', () => { void close().finally(() => process.exit(0)); });
}
main().catch(() => { process.stderr.write('Private HTTPS unavailable\n'); process.exitCode = 1; void pool.end(); });
