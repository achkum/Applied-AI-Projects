// ST-237 opt-in development-only composition. No default API module or second listener is loaded.
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import process from 'node:process';
import { createHash, X509Certificate } from 'node:crypto';
import { TLSSocket } from 'node:tls';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const webDir = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(webDir, '../api');
const webRequire = createRequire(path.join(webDir, 'package.json'));
const apiRequire = createRequire(path.join(apiDir, 'package.json'));
const fail = () => { throw new Error('Private HTTPS unavailable'); };
const gate = name => process.stderr.write(`ST237_STARTUP_GATE ${name}\n`);
// Diagnose Next startup without exporting exception text, paths, or environment values.
function nextFailureClass(error) {
  const causes = [error, error?.cause];
  for (const cause of causes) {
    if (cause?.code === 'EADDRINUSE') return 'PORT';
    if (cause?.code === 'EACCES' || cause?.code === 'EPERM') return 'PERMISSION';
    if (cause?.code === 'ENOENT' || cause?.code === 'ERR_MODULE_NOT_FOUND' || cause?.code === 'MODULE_NOT_FOUND') return 'MISSING_FILE';
    const message = typeof cause?.message === 'string' ? cause.message : '';
    if (/\block\b/i.test(message)) return 'LOCK';
    if (/turbopack|swc|native binding/i.test(message)) return 'COMPILER';
    if (/next\.config|configuration/i.test(message)) return 'CONFIG';
    if (/module not found|cannot find module|no such file/i.test(message)) return 'MISSING_FILE';
    if (cause?.name === 'TypeError') return 'TYPE';
    if (cause?.name === 'SyntaxError') return 'SYNTAX';
  }
  return 'OTHER';
}
const env = process.env;
gate('ENV');
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

// These are reviewed installation inputs, not values learned from the database being
// qualified. Keep the file pins in this launcher when changing any qualified SQL.
const qualifiedSqlPins = Object.freeze({
  '001-epoch-nonce-reservation.sql': '7ada99f0863aca74e8f6e25e3e990e796e619c2118f138b8f1c2daa867c82bd2',
  '002-epoch-fence.sql': '1fa14fd1e0e487806550b74280d94f94de245fe231d7e34c4a5f7c70ddf104d9',
  '003-nonce-binding-lookup.sql': '94239213cefab43db0fd2b339361331c1de6ac6d94aa6e4885d532c2cc3076b9',
  '004-bootstrap-reservation.sql': 'eda3b86bd75161c2c617c1c2e02ee293e00077c31eb60b473e0d7a1062bcf0bf',
  '005-expired-reservation-prune.sql': 'd76d2297e4f146603f9cbcf3732e497746214aa2c8e5936afeebaa6d4ce68354',
  '006-owned-bootstrap-settlement.sql': '8c6313958d52a91f883d9a875840fbc7656adcad8b3326fa1e24da11e6692d85',
  '007-expired-nonce-prune.sql': '6ff9c97d3c8ed80735ca59cb41a581eb894b16ac33a704ddae9db262d5ed4baa',
  '008-atomic-bootstrap-nonce-issue.sql': 'd49635b5303fc9405f8ab1b5609859a9dca7129b8a7f36f41a29453cf2ea4d62',
  '009-current-web-session-csrf.sql': 'f7c026ee9dac458bbfbbea13e1774d3bd392fdab8e5c4659185dc769ecab2c9b',
  '010-enrollment-account.sql': '954be5c4ae1c018aac161a5ec7e59d2bd1bc478df5310a7a15f968f8bfd90a4a',
});
const privacyMigrationPin = 'b2ef9ebbdce9f9dddff9f43b6679e0fdac58324c2a6ef060af33662ec89a2f9a';
const digest = value => createHash('sha256').update(value).digest('hex');

function commaSeparatedDefinitions(source) {
  const parts = [];
  let depth = 0, quoted = false, start = 0;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === "'") {
      if (quoted && source[i + 1] === "'") { i++; continue; }
      quoted = !quoted;
    } else if (!quoted && char === '(') depth++;
    else if (!quoted && char === ')') depth--;
    else if (!quoted && depth === 0 && char === ',') {
      parts.push(source.slice(start, i).trim()); start = i + 1;
    }
  }
  if (quoted || depth !== 0) fail();
  parts.push(source.slice(start).trim());
  return parts;
}

function approvedFunctions() {
  gate('SOURCE');
  const expected = new Map();
  const policies = [];
  const columns = [];
  const migrationDir = path.resolve(apiDir, 'prisma/development-auth');
  for (const [file, hash] of Object.entries(qualifiedSqlPins)) {
    const source = fs.readFileSync(path.join(migrationDir, file));
    if (digest(source) !== hash) fail();
    const sql = source.toString('utf8');
    const bodies = [...sql.matchAll(/CREATE FUNCTION\s+(subtrack_auth\.[a-z_]+)\([\s\S]*?\)\s+RETURNS\s+[\s\S]*?\s+AS\s+(\$[a-z_]+\$)([\s\S]*?)\2;/g)];
    const signatures = [...sql.matchAll(/ALTER FUNCTION\s+(subtrack_auth\.[a-z_]+\([^;]*?\))\s+OWNER TO subtrack_auth_executor;/g)];
    const grants = [...sql.matchAll(/GRANT EXECUTE ON FUNCTION\s+(subtrack_auth\.[a-z_]+\([^;]*?\))\s+TO\s+([a-z0-9_,]+);/g)];
    for (const match of sql.matchAll(/CREATE POLICY\s+([a-z_]+)\s+ON subtrack_auth\.([a-z_]+)\s+FOR (SELECT|INSERT|UPDATE|DELETE)\s+TO subtrack_auth_executor(?:\s+USING \((true)\))?(?:\s+WITH CHECK \((true|false)\))?;/g)) {
      policies.push([match[2],match[1],{SELECT:'r',INSERT:'a',UPDATE:'w',DELETE:'d'}[match[3]],
        true,['subtrack_auth_executor'],match[4] ?? null,match[5] ?? null]);
    }
    for (const table of sql.matchAll(/CREATE TABLE subtrack_auth\.([a-z_]+)\s*\(([\s\S]*?)\);/g)) {
      let position = 0;
      for (const definition of commaSeparatedDefinitions(table[2])) {
        if (/^(?:PRIMARY KEY|UNIQUE|FOREIGN KEY|CHECK)\s*\(/.test(definition)) continue;
        const column = /^([a-z_]+)\s+(pg_catalog\.[a-z0-9_]+|subtrack_auth\.[a-z_]+)/.exec(definition);
        if (!column) fail();
        const type = { 'pg_catalog.uuid':'uuid','pg_catalog.text':'text',
          'pg_catalog.int2':'smallint','pg_catalog.int8':'bigint',
          'pg_catalog.xid8':'xid8' }[column[2]] ?? column[2];
        columns.push([table[1],++position,column[1],type,
          /\bNOT NULL\b|\bPRIMARY KEY\b/.test(definition),/\bDEFAULT\b/.test(definition)]);
      }
    }
    if (bodies.length !== signatures.length) fail();
    for (let i = 0; i < bodies.length; i++) {
      const name = bodies[i][1];
      const signature = signatures[i][1].replace(/\s+/g, '');
      if (!signature.startsWith(`${name}(`) || expected.has(name)) fail();
      const granted = grants.find(g => g[1].replace(/\s+/g, '') === signature);
      const declaredResult = /\bRETURNS\s+(pg_catalog\.[a-z0-9_]+|TABLE\s*\()/i.exec(bodies[i][0])?.[1];
      if (!declaredResult) fail();
      expected.set(name, { signature, body: bodies[i][3],
        result: declaredResult.startsWith('TABLE') ? 'pg_catalog.record' : declaredResult,
        returnsSet: declaredResult.startsWith('TABLE'),
        grants: granted ? granted[2].split(',').sort() : [] });
    }
  }
  if (expected.size !== 25 || policies.length !== 43 || columns.length !== 115) fail();
  return { functions: expected, policies, columns };
}

async function assertQualifiedCatalog(client) {
  const approved = approvedFunctions();
  const expected = approved.functions;
  gate('FUNCTIONS');
  const functions = await client.query(`SELECT p.proname::text AS name,p.oid::text AS oid,
      p.prosrc::text AS body,p.prosecdef AS security_definer,p.provolatile::text AS volatility,
      p.proparallel::text AS parallel,p.proisstrict AS strict,p.proretset AS returns_set,
      p.prorettype::pg_catalog.oid::text AS result_oid,
      p.proargmodes::text[] AS arg_modes,p.proargnames::text[] AS arg_names,
      p.proconfig::text[] AS config,l.lanname::text AS language,r.rolname::text AS owner,
      ARRAY(SELECT pg_catalog.pg_get_userbyid(a.grantee)::text
        FROM pg_catalog.aclexplode(p.proacl) a WHERE a.grantee<>p.proowner
          AND a.privilege_type='EXECUTE' AND NOT a.is_grantable
        ORDER BY pg_catalog.pg_get_userbyid(a.grantee)) AS execute_grantees,
      EXISTS (SELECT 1 FROM pg_catalog.aclexplode(p.proacl) a
        WHERE a.grantee<>p.proowner AND (a.privilege_type<>'EXECUTE' OR a.is_grantable)) AS bad_grant
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
    JOIN pg_catalog.pg_language l ON l.oid=p.prolang
    WHERE n.nspname='subtrack_auth' ORDER BY p.proname`);
  if (functions.rows.length !== expected.size) { gate('FUNCTION_COUNT'); fail(); }
  for (const row of functions.rows) {
    const entry = expected.get(`subtrack_auth.${row.name}`);
    if (!entry) { gate('FUNCTION_NAME'); fail(); }
    const predicates = [
      ['BODY', row.body === entry.body], ['SECURITY', row.security_definer],
      ['OWNER', row.owner === 'subtrack_auth_executor'], ['LANGUAGE', row.language === 'plpgsql'],
      ['VOLATILITY', row.volatility === 'v'], ['PARALLEL', row.parallel === 'u'],
      ['STRICT', row.strict === false], ['SET', row.returns_set === entry.returnsSet],
      ['CONFIG', JSON.stringify(row.config) === '["search_path=pg_catalog"]'],
      ['GRANT_KIND', !row.bad_grant],
      ['GRANTEES', JSON.stringify(row.execute_grantees) === JSON.stringify(entry.grants)],
    ];
    const rejected = predicates.find(([, ok]) => !ok);
    if (rejected) {
      // Both words come from the pinned source roster. Never export database bodies or row values.
      process.stderr.write(`ST237_FUNCTION_GATE ${row.name} ${rejected[0]}\n`);
      fail();
    }
    const identity = await client.query(`SELECT pg_catalog.to_regprocedure($1::text)::pg_catalog.oid::text AS oid,
      pg_catalog.to_regtype($2::text)::pg_catalog.oid::text AS result_oid`,
      [entry.signature, entry.result]);
    if (identity.rows[0]?.oid !== row.oid || identity.rows[0]?.result_oid !== row.result_oid) {
      process.stderr.write(`ST237_FUNCTION_GATE ${row.name} SIGNATURE\n`); fail();
    }
    if (row.name === 'terminal_enrollment' &&
      (JSON.stringify(row.arg_modes) !== '["i","i","i","t","t","t","t","t","t"]' ||
        JSON.stringify(row.arg_names) !== '["scope","verified_h","terminal_nonce_h","subject_h","channel","contact","verified_at","given_name","surname"]')) {
      process.stderr.write('ST237_FUNCTION_GATE terminal_enrollment TERMINAL_ARGS\n'); fail();
    }
  }
  return { policies: approved.policies, columns: approved.columns };
}

async function assertProfileCatalog(client) {
  gate('PRINCIPALS');
  const privacySource = fs.readFileSync(path.resolve(apiDir,
    'prisma/migrations/0002_privacy_constraints/migration.sql'));
  if (digest(privacySource) !== privacyMigrationPin) fail();
  const privacySql = privacySource.toString('utf8');
  const principalBodies = ['subtrack_principal', 'subtrack_principal_matches'].map(name => {
    const match = new RegExp(`CREATE FUNCTION public\\.${name}\\([^;]*?AS \\$\\$([\\s\\S]*?)\\$\\$;`).exec(privacySql);
    if (!match) fail();
    return match[1];
  });
  const principals = await client.query(`SELECT p.proname::text AS name,p.oid::text AS oid,
      p.prorettype::pg_catalog.oid::text AS result_oid,p.prosrc::text AS body,
      p.prosecdef AS security_definer,p.provolatile::text AS volatility,
      p.proconfig::text[] AS config,l.lanname::text AS language,r.rolname::text AS owner,
      ARRAY(SELECT pg_catalog.pg_get_userbyid(a.grantee)::text
        FROM pg_catalog.aclexplode(p.proacl) a WHERE a.grantee<>p.proowner
        ORDER BY pg_catalog.pg_get_userbyid(a.grantee)) AS grantees
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
    JOIN pg_catalog.pg_language l ON l.oid=p.prolang
    WHERE n.nspname='public' AND p.proname IN ('subtrack_principal','subtrack_principal_matches')
    ORDER BY p.proname`);
  if (principals.rows.length !== 2 || principals.rows.some((row, i) =>
    row.name !== ['subtrack_principal','subtrack_principal_matches'][i] ||
    row.body !== principalBodies[i] || row.security_definer !== true ||
    row.volatility !== 's' || row.language !== 'sql' ||
    row.owner !== 'subtrack_visibility_lookup' ||
    JSON.stringify(row.config) !== '["search_path=pg_catalog"]' ||
    JSON.stringify(row.grantees) !== JSON.stringify(i === 0 ? [] : ['subtrack_runtime']))) fail();
  const principalIdentity = await client.query(`SELECT
      pg_catalog.to_regprocedure('public.subtrack_principal()')::pg_catalog.oid::text AS principal_oid,
      pg_catalog.to_regprocedure('public.subtrack_principal_matches(pg_catalog.uuid)')::pg_catalog.oid::text AS matches_oid,
      'pg_catalog.uuid'::pg_catalog.regtype::pg_catalog.oid::text AS uuid_oid,
      'pg_catalog.bool'::pg_catalog.regtype::pg_catalog.oid::text AS bool_oid`);
  if (principalIdentity.rows[0]?.principal_oid !== principals.rows[0].oid ||
    principalIdentity.rows[0]?.matches_oid !== principals.rows[1].oid ||
    principalIdentity.rows[0]?.uuid_oid !== principals.rows[0].result_oid ||
    principalIdentity.rows[0]?.bool_oid !== principals.rows[1].result_oid) fail();
  const birthTrigger = await client.query(`SELECT t.tgenabled::text AS enabled,t.tgtype AS type,
      t.tgfoid::text AS function_oid
    FROM pg_catalog.pg_trigger t WHERE t.tgrelid='public.identity'::pg_catalog.regclass
      AND t.tgname='identity_enrollment_birth' AND NOT t.tgisinternal`);
  const birthFunction = await client.query(`SELECT
    pg_catalog.to_regprocedure('subtrack_auth.attest_enrollment_birth()')::pg_catalog.oid::text AS oid`);
  if (birthTrigger.rows.length !== 1 || birthTrigger.rows[0].enabled !== 'O' ||
    birthTrigger.rows[0].type !== 5 || birthTrigger.rows[0].function_oid !== birthFunction.rows[0]?.oid) fail();
  gate('PROFILE_COLUMNS');
  const columns = await client.query(`SELECT c.relname::text AS table_name,a.attname::text AS name,
      a.attnum AS position,pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,
      NOT a.attnotnull AS nullable,pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS default_value
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    WHERE n.nspname='public' AND
      (c.relname='identity_profile' OR (c.relname='identity' AND a.attname IN ('verified_at','given_name','surname')))
    ORDER BY c.relname,a.attnum`);
  const expectedColumns = [
    ['identity','verified_at','timestamp with time zone',true,null],
    ['identity','given_name','character varying(120)',true,null],
    ['identity','surname','character varying(120)',true,null],
    ['identity_profile','identity_id','uuid',false,null],
    ['identity_profile','display_name','character varying(120)',true,null],
    ['identity_profile','avatar_color','character varying(32)',true,null],
    ['identity_profile','avatar_emoji','character varying(32)',true,null],
    ['identity_profile','language','character varying(2)',false,"'en'::character varying"],
    ['identity_profile','theme','character varying(16)',false,"'system'::character varying"],
    ['identity_profile','default_currency','character(3)',false,"'SEK'::bpchar"],
    ['identity_profile','profile_complete','boolean',false,'false'],
    ['identity_profile','created_at','timestamp with time zone',false,'now()'],
    ['identity_profile','updated_at','timestamp with time zone',false,'now()'],
  ];
  if (columns.rows.length !== expectedColumns.length ||
    columns.rows.some((row, i) => JSON.stringify([row.table_name,row.name,row.type,row.nullable,row.default_value]) !==
      JSON.stringify(expectedColumns[i]) ||
      (row.table_name === 'identity_profile' && row.position !== i - 2))) fail();

  const catalog = await client.query(`SELECT c.relkind::text AS kind,c.relrowsecurity AS rls,
      c.relforcerowsecurity AS force_rls,r.rolname::text AS owner
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_roles r ON r.oid=c.relowner
    WHERE c.oid='public.identity_profile'::pg_catalog.regclass`);
  if (catalog.rows.length !== 1 || catalog.rows[0].kind !== 'r' ||
    !catalog.rows[0].rls || !catalog.rows[0].force_rls ||
    catalog.rows[0].owner !== 'st233a_fixture_owner') fail();
  gate('PROFILE_POLICIES');
  const policies = await client.query(`SELECT p.polname::text AS name,p.polcmd::text AS command,
      p.polpermissive AS permissive,
      ARRAY(SELECT r.rolname::text FROM pg_catalog.pg_roles r WHERE r.oid=ANY(p.polroles) ORDER BY r.rolname) AS roles,
      pg_catalog.pg_get_expr(p.polqual,p.polrelid) AS using_expr,
      pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid) AS check_expr
    FROM pg_catalog.pg_policy p WHERE p.polrelid='public.identity_profile'::pg_catalog.regclass
    ORDER BY p.polname`);
  const principal = 'subtrack_principal_matches(identity_id)';
  const expectedPolicies = [
    ['identity_profile_insert','a',true,['subtrack_runtime'],null,principal],
    ['identity_profile_select','r',true,['subtrack_runtime'],principal,null],
    ['identity_profile_update','w',true,['subtrack_runtime'],principal,principal],
  ];
  if (JSON.stringify(policies.rows.map(p => [p.name,p.command,p.permissive,p.roles,p.using_expr,p.check_expr])) !==
    JSON.stringify(expectedPolicies)) fail();
  gate('PROFILE_GRANTS');
  const grants = await client.query(`SELECT 'table' AS scope,NULL::text AS column_name,
      CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END AS grantee,
      x.privilege_type AS privilege,x.is_grantable AS grantable
    FROM pg_catalog.pg_class c CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) x
    WHERE c.oid='public.identity_profile'::pg_catalog.regclass AND x.grantee<>c.relowner
    UNION ALL
    SELECT 'column' AS scope,a.attname::text AS column_name,
      CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END AS grantee,
      x.privilege_type AS privilege,x.is_grantable AS grantable
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
      AND a.attnum>0 AND NOT a.attisdropped
    CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) x
    WHERE c.oid='public.identity_profile'::pg_catalog.regclass AND x.grantee<>c.relowner`);
  const expectedGrants = [
    ['table',null,'subtrack_runtime','SELECT',false],
    ['table',null,'subtrack_runtime','INSERT',false],
    ...['display_name','avatar_color','avatar_emoji','language','theme','default_currency',
      'profile_complete','updated_at'].map(name => ['column',name,'subtrack_runtime','UPDATE',false]),
  ];
  const grantKey = item => JSON.stringify(item);
  const actualGrants = grants.rows.map(g => [g.scope,g.column_name,g.grantee,g.privilege,g.grantable]);
  if (JSON.stringify(actualGrants.map(grantKey).sort()) !== JSON.stringify(expectedGrants.map(grantKey).sort())) fail();

  gate('PROFILE_CONSTRAINTS');
  const constraints = await client.query(`SELECT k.conname::text AS name,k.contype::text AS kind,
      pg_catalog.pg_get_constraintdef(k.oid,false) AS definition,k.convalidated AS validated,
      k.condeferrable AS deferrable,k.condeferred AS deferred
    FROM pg_catalog.pg_constraint k
    WHERE k.conrelid='public.identity_profile'::pg_catalog.regclass ORDER BY k.conname`);
  if (constraints.rows.length !== 5 || constraints.rows.some(c => !c.validated || c.deferrable || c.deferred)) fail();
  const byName = new Map(constraints.rows.map(c => [c.name,c]));
  if (byName.size !== 5 ||
    byName.get('identity_profile_pkey')?.definition !== 'PRIMARY KEY (identity_id)' ||
    byName.get('identity_profile_pkey')?.kind !== 'p' ||
    byName.get('identity_profile_identity_id_fkey')?.definition !==
      'FOREIGN KEY (identity_id) REFERENCES identity(id) ON UPDATE RESTRICT ON DELETE RESTRICT' ||
    byName.get('identity_profile_identity_id_fkey')?.kind !== 'f' ||
    !/^CHECK \(\(\(language\)::text = ANY \(\(ARRAY\['sv'::character varying, 'en'::character varying\]\)::text\[\]\)\)\)$/.test(
      byName.get('identity_profile_language_check')?.definition ?? '') ||
    !/^CHECK \(\(\(theme\)::text = ANY \(\(ARRAY\['system'::character varying, 'light'::character varying, 'dark'::character varying\]\)::text\[\]\)\)\)$/.test(
      byName.get('identity_profile_theme_check')?.definition ?? '') ||
    byName.get('identity_profile_default_currency_check')?.definition !==
      "CHECK ((default_currency = 'SEK'::bpchar))") fail();
}

async function assertAuthCatalog(client, approved) {
  gate('AUTH_TABLES');
  const authTables = ['credential','csrf','enrollment_intent','epoch','family','identity_birth',
    'nonce','otp','pending_enrollment','reservation','restricted_proof','session','verified_enrollment'];
  const tables = await client.query(`SELECT c.relname::text AS name,c.relkind::text AS kind,
      c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls,r.rolname::text AS owner
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_catalog.pg_roles r ON r.oid=c.relowner
    WHERE n.nspname='subtrack_auth' AND c.relkind IN ('r','p') ORDER BY c.relname`);
  if (JSON.stringify(tables.rows.map(t => t.name)) !== JSON.stringify(authTables) ||
    tables.rows.some(t => t.kind !== 'r' || !t.rls || !t.force_rls ||
      t.owner !== 'subtrack_auth_owner')) fail();
  const columns = await client.query(`SELECT c.relname::text AS table_name,a.attnum AS position,
      a.attname::text AS name,pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,
      a.attnotnull AS not_null,a.atthasdef AS has_default
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    WHERE n.nspname='subtrack_auth' AND c.relkind='r' ORDER BY c.relname,a.attnum`);
  const sortRows = rows => rows.map(r => JSON.stringify(r)).sort();
  const actualColumns = columns.rows.map(c =>
    [c.table_name,c.position,c.name,c.type,c.not_null,c.has_default]);
  if (JSON.stringify(sortRows(actualColumns)) !== JSON.stringify(sortRows(approved.columns))) fail();
  const roles = await client.query(`SELECT rolname::text AS name,rolcanlogin AS login,
      rolsuper AS super,rolcreatedb AS create_db,rolcreaterole AS create_role,
      rolbypassrls AS bypass_rls,rolinherit AS inherit,rolreplication AS replication,
      rolconnlimit AS connection_limit,rolvaliduntil IS NULL AS no_expiry,
      rolconfig IS NULL AS no_config
    FROM pg_catalog.pg_roles WHERE rolname IN
      ('subtrack_auth_owner','subtrack_auth_executor','subtrack_auth_producer','subtrack_dev_auth_login',
       'subtrack_runtime','subtrack_catalogue_writer','subtrack_otp_service',
       'subtrack_invitation_service','subtrack_identity_provisioner','subtrack_visibility_lookup')
    ORDER BY rolname`);
  const approvedRoles = [
    'subtrack_auth_executor','subtrack_auth_owner','subtrack_auth_producer',
    'subtrack_catalogue_writer','subtrack_dev_auth_login','subtrack_identity_provisioner',
    'subtrack_invitation_service','subtrack_otp_service','subtrack_runtime',
    'subtrack_visibility_lookup',
  ];
  if (roles.rows.length !== approvedRoles.length || roles.rows.some((r, i) =>
    r.name !== approvedRoles[i] || r.super || r.create_db || r.create_role ||
    r.bypass_rls !== (r.name === 'subtrack_visibility_lookup') || r.inherit ||
    r.replication || r.connection_limit !== -1 || !r.no_expiry || !r.no_config ||
    r.login !== (r.name === 'subtrack_dev_auth_login'))) fail();
  // Every edge incident to a private or business role is reviewed. This also
  // rejects transitive privilege additions through an otherwise unknown role.
  const membership = await client.query(`SELECT pg_catalog.pg_get_userbyid(m.roleid)::text AS role,
      pg_catalog.pg_get_userbyid(m.member)::text AS member,
      m.admin_option AS admin,m.inherit_option AS inherit,m.set_option AS can_set
    FROM pg_catalog.pg_auth_members m
    WHERE m.roleid IN (SELECT oid FROM pg_catalog.pg_roles WHERE rolname=ANY($1::text[]))
       OR m.member IN (SELECT oid FROM pg_catalog.pg_roles WHERE rolname=ANY($1::text[]))
    ORDER BY role,member`, [approvedRoles]);
  if (JSON.stringify(membership.rows) !== JSON.stringify([
    {role:'subtrack_auth_producer',member:'subtrack_dev_auth_login',admin:false,inherit:false,can_set:true},
    {role:'subtrack_identity_provisioner',member:'subtrack_dev_auth_login',admin:false,inherit:false,can_set:true},
    {role:'subtrack_runtime',member:'subtrack_dev_auth_login',admin:false,inherit:false,can_set:true},
  ])) fail();
  const authSchema = await client.query(`SELECT r.rolname::text AS owner,
      ARRAY(SELECT pg_catalog.pg_get_userbyid(a.grantee)::text || ':' || a.privilege_type ||
        ':' || a.is_grantable::text FROM pg_catalog.aclexplode(n.nspacl) a
        WHERE a.grantee<>n.nspowner ORDER BY pg_catalog.pg_get_userbyid(a.grantee)) AS grants
    FROM pg_catalog.pg_namespace n JOIN pg_catalog.pg_roles r ON r.oid=n.nspowner
    WHERE n.nspname='subtrack_auth'`);
  if (authSchema.rows.length !== 1 || authSchema.rows[0].owner !== 'subtrack_auth_owner' ||
    JSON.stringify(authSchema.rows[0].grants) !== JSON.stringify([
      'subtrack_auth_executor:USAGE:false','subtrack_auth_producer:USAGE:false',
      'subtrack_runtime:USAGE:false'])) fail();
  const domains = await client.query(`SELECT t.typname::text AS name,
      t.typbasetype::pg_catalog.regtype::text AS base,
      r.rolname::text AS owner,t.typnotnull AS not_null,
      ARRAY(SELECT pg_catalog.pg_get_userbyid(a.grantee)::text
        FROM pg_catalog.aclexplode(t.typacl) a WHERE a.grantee<>t.typowner
        ORDER BY pg_catalog.pg_get_userbyid(a.grantee)) AS grantees,
      (SELECT pg_catalog.count(*)::pg_catalog.int4 FROM pg_catalog.pg_constraint c
        WHERE c.contypid=t.oid AND c.contype='c' AND c.convalidated) AS checks
    FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
    JOIN pg_catalog.pg_roles r ON r.oid=t.typowner
    WHERE n.nspname='subtrack_auth' AND t.typtype='d' ORDER BY t.typname`);
  if (domains.rows.length !== 2 || domains.rows.some((d, i) =>
    d.name !== ['h','ms'][i] || d.base !== ['text','bigint'][i] ||
    d.owner !== 'subtrack_auth_owner' || d.not_null || d.checks !== 1 ||
    JSON.stringify(d.grantees) !==
      '["subtrack_auth_executor","subtrack_auth_producer","subtrack_runtime"]')) fail();
  const scopeType = await client.query(`SELECT r.rolname::text AS owner,
      ARRAY(SELECT pg_catalog.pg_get_userbyid(a.grantee)::text || ':' || a.privilege_type ||
        ':' || a.is_grantable::text FROM pg_catalog.aclexplode(t.typacl) a
        WHERE a.grantee<>t.typowner ORDER BY pg_catalog.pg_get_userbyid(a.grantee)) AS grants
    FROM pg_catalog.pg_type t JOIN pg_catalog.pg_roles r ON r.oid=t.typowner
    WHERE t.oid='subtrack_auth.enrollment_scope'::pg_catalog.regtype`);
  if (scopeType.rows.length !== 1 || scopeType.rows[0].owner !== 'subtrack_auth_owner' ||
    JSON.stringify(scopeType.rows[0].grants) !== JSON.stringify([
      'subtrack_auth_executor:USAGE:false','subtrack_auth_producer:USAGE:false',
      'subtrack_runtime:USAGE:false'])) fail();

  gate('AUTH_POLICIES');
  const policies = await client.query(`SELECT c.relname::text AS table_name,p.polname::text AS name,
      p.polcmd::text AS command,p.polpermissive AS permissive,
      ARRAY(SELECT r.rolname::text FROM pg_catalog.pg_roles r
        WHERE r.oid=ANY(p.polroles) ORDER BY r.rolname) AS roles,
      pg_catalog.pg_get_expr(p.polqual,p.polrelid) AS using_expr,
      pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid) AS check_expr
    FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='subtrack_auth' ORDER BY c.relname,p.polname`);
  const actualPolicies = policies.rows.map(p =>
    [p.table_name,p.name,p.command,p.permissive,p.roles,p.using_expr,p.check_expr]);
  if (JSON.stringify(sortRows(actualPolicies)) !== JSON.stringify(sortRows(approved.policies))) fail();

  gate('AUTH_GRANTS');
  const acl = await client.query(`SELECT c.relname::text AS table_name,'table' AS scope,
      NULL::text AS column_name,pg_catalog.pg_get_userbyid(x.grantee)::text AS grantee,
      x.privilege_type AS privilege,x.is_grantable AS grantable
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) x
    WHERE n.nspname='subtrack_auth' AND c.relkind='r' AND x.grantee<>c.relowner
    UNION ALL
    SELECT c.relname::text,'column',a.attname::text,
      pg_catalog.pg_get_userbyid(x.grantee)::text,x.privilege_type,x.is_grantable
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) x
    WHERE n.nspname='subtrack_auth' AND c.relkind='r' AND x.grantee<>c.relowner`);
  const tableGrant = (tables, privileges) => tables.flatMap(table =>
    privileges.map(privilege => [table,'table',null,'subtrack_auth_executor',privilege,false]));
  const columnGrant = (table, columns) => columns.map(name =>
    [table,'column',name,'subtrack_auth_executor','UPDATE',false]);
  const expectedAcl = [
    ...tableGrant(['epoch'],['SELECT']),
    ...tableGrant(['reservation','nonce'],['SELECT','INSERT','DELETE']),
    ...tableGrant(['family','session','credential'],['SELECT','INSERT']),
    ...tableGrant(['csrf'],['SELECT','INSERT','DELETE']),
    ...tableGrant(['otp','restricted_proof','pending_enrollment','verified_enrollment',
      'enrollment_intent','identity_birth'],['SELECT','INSERT','DELETE']),
    ...columnGrant('epoch',['watermark_ms']),...columnGrant('reservation',['state']),
    ...columnGrant('family',['revoked_ms']),...columnGrant('session',['revoked_ms']),
    ...columnGrant('csrf',['token_h','issued_ms','expires_ms']),
    ...columnGrant('otp',['attempts']),...columnGrant('restricted_proof',['proof_h']),
    ...columnGrant('pending_enrollment',['pending_h']),
    ...columnGrant('verified_enrollment',['identity_id']),
  ];
  const actualAcl = acl.rows.map(a =>
    [a.table_name,a.scope,a.column_name,a.grantee,a.privilege,a.grantable]);
  if (JSON.stringify(sortRows(actualAcl)) !== JSON.stringify(sortRows(expectedAcl))) fail();

  gate('AUTH_CONSTRAINTS');
  // Four independent C8 private PG16 installs from pinned SQL001-010 produced
  // this exact definition projection before key/row/schema mutation.
  const constraints = await client.query(`SELECT pg_catalog.md5(pg_catalog.string_agg(
      pg_catalog.format('%s:%s:%s:%s:%s',c.conname,c.contype,c.convalidated,c.condeferrable,
        pg_catalog.pg_get_constraintdef(c.oid)),E'\\n' ORDER BY c.conname,c.oid)) AS pin
    FROM pg_catalog.pg_constraint c WHERE c.connamespace='subtrack_auth'::pg_catalog.regnamespace`);
  if (constraints.rows.length !== 1 || constraints.rows[0].pin !== '20d5868b5252c03b0d54b691938e860c') fail();
  const constraintCounts = await client.query(`SELECT c.relname::text AS table_name,
      pg_catalog.count(*)::pg_catalog.int4 AS total,
      pg_catalog.bool_and(k.convalidated AND
        (k.condeferrable=k.condeferred) AND
        (NOT k.condeferrable OR
          (c.relname='verified_enrollment' AND
           k.conname='verified_enrollment_terminal_nonce_h_fkey'))) AS strict
    FROM pg_catalog.pg_constraint k JOIN pg_catalog.pg_class c ON c.oid=k.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='subtrack_auth' GROUP BY c.relname ORDER BY c.relname`);
  const expectedCounts = new Map([
    ['credential',5],['csrf',3],['enrollment_intent',1],['epoch',5],['family',5],
    ['identity_birth',1],['nonce',8],['otp',8],['pending_enrollment',7],
    ['reservation',8],['restricted_proof',7],['session',9],['verified_enrollment',12],
  ]);
  if (constraintCounts.rows.length !== expectedCounts.size || constraintCounts.rows.some(c =>
    c.total !== expectedCounts.get(c.table_name) || c.strict !== true)) fail();
}

async function assertStartup() {
  gate('CONNECT');
  const client = await pool.connect();
  let complete = false;
  try {
    gate('IDENTITY');
    const state = await client.query(`SELECT pg_catalog.current_database()::text AS database_name,
      session_user::text AS session_user, current_user::text AS current_user,
      pg_catalog.current_setting('app.user_id',true) AS user_id,
      pg_catalog.current_setting('app.current_user_id',true) AS current_user_id,
      EXISTS (SELECT 1 FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname='identity_profile' AND c.relkind='r') AS profile_table,
      EXISTS (SELECT 1 FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='subtrack_auth' AND c.relname='epoch' AND c.relkind='r') AS epoch_table`);
    const row = state.rows[0];
    if (state.rowCount !== 1 || row.database_name !== epoch.database || row.session_user !== epoch.login ||
      row.current_user !== epoch.login || ![null, ''].includes(row.user_id) || ![null, ''].includes(row.current_user_id) ||
      row.profile_table !== true || row.epoch_table !== true) fail();
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    await client.query('SET LOCAL ROLE subtrack_runtime');
    const qualified = await client.query(`SELECT pg_catalog.current_database()::text AS database_name,
      session_user::text AS session_user,current_user::text AS current_user,
      pg_catalog.current_setting('app.user_id',true) AS user_id,
      pg_catalog.current_setting('app.current_user_id',true) AS current_user_id`);
    if (qualified.rows.length !== 1 || qualified.rows[0].database_name !== epoch.database ||
      qualified.rows[0].session_user !== epoch.login || qualified.rows[0].current_user !== 'subtrack_runtime' ||
      ![null, ''].includes(qualified.rows[0].user_id) ||
      ![null, ''].includes(qualified.rows[0].current_user_id)) fail();
    const approved = await assertQualifiedCatalog(client);
    await assertProfileCatalog(client);
    await assertAuthCatalog(client, approved);
    const rls = await client.query(`SELECT n.nspname::text AS schema_name,c.relname::text AS table_name,
      c.relrowsecurity AS enabled,c.relforcerowsecurity AS forced
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE (n.nspname='subtrack_auth' AND c.relname=ANY($1::text[]))
         OR (n.nspname='public' AND c.relname='identity_profile')`,
      [['epoch','reservation','nonce','family','session','credential','csrf','otp','restricted_proof',
        'pending_enrollment','verified_enrollment','enrollment_intent','identity_birth']]);
    if (rls.rows.length !== 14 || rls.rows.some(item => item.enabled !== true || item.forced !== true)) fail();
    gate('EPOCH');
    let fence;
    try {
      fence = await client.query('SELECT subtrack_auth.fence($1::text,$2::subtrack_auth.h,$3::subtrack_auth.ms) AS ok',
        [epoch.epoch, epoch.manifestHash, Date.now()]);
    } catch (error) {
      gate('FENCE_QUERY_FAILED');
      throw error;
    }
    if (fence.rows.length !== 1 || fence.rows[0].ok !== true) {
      gate('FENCE_REJECTED');
      fail();
    }
    gate('FENCE_ACCEPTED');
    try { await client.query('COMMIT'); }
    catch (error) { gate('COMMIT_FAILED'); throw error; }
    gate('COMMIT_CLEAN');
    const after = await client.query(`SELECT pg_catalog.current_database()::text AS database_name,
      session_user::text AS session_user, current_user::text AS current_user,
      pg_catalog.current_setting('app.user_id',true) AS user_id,
      pg_catalog.current_setting('app.current_user_id',true) AS current_user_id`);
    if (after.rows.length !== 1 || after.rows[0].database_name !== epoch.database ||
      after.rows[0].session_user !== epoch.login || after.rows[0].current_user !== epoch.login ||
      ![null, ''].includes(after.rows[0].user_id) || ![null, ''].includes(after.rows[0].current_user_id)) {
      gate('RESET_REJECTED');
      fail();
    }
    gate('RESET_CLEAN');
    complete = true;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* Discard the unclean connection below. */ }
    throw error;
  } finally { client.release(!complete); }
}

async function main() {
  await assertStartup();
  gate('COMPOSITION');
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
  gate('COMPOSITION_READY');
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
  gate('FRAMEWORK');
  const nest = await NestFactory.create(PrivateModule, new ExpressAdapter(api), { logger: false, bodyParser: false });
  await nest.init();
  gate('FRAMEWORK_READY');
  const nextApp = next({ dev: true, dir: webDir, hostname: 'localhost', port: 3443 });
  gate('NEXT');
  try { await nextApp.prepare(); }
  catch (error) { gate(`NEXT_FAILED_${nextFailureClass(error)}`); throw error; }
  gate('NEXT_READY');
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
  gate('LISTEN');
  server.listen(3443, '127.0.0.1', () => process.stdout.write('ST237_PRIVATE_HTTPS_READY\n'));
  const close = async () => { server.close(); server.closeAllConnections(); await nest.close(); await nextApp.close(); await pool.end(); };
  process.once('SIGTERM', () => { void close().finally(() => process.exit(0)); });
  process.once('SIGINT', () => { void close().finally(() => process.exit(0)); });
}
main().catch(error => {
  if (/^[A-Z0-9]{5}$/.test(error?.code ?? '')) process.stderr.write(`ST237_STARTUP_SQLSTATE ${error.code}\n`);
  process.stderr.write('Private HTTPS unavailable\n'); process.exitCode = 1; void pool.end();
});
