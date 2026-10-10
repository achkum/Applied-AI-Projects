import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';

// This entrypoint runs only against the script's newly created PostgreSQL 16.
test('full-chain catalog and ordinary LOGIN privacy proof', async () => {
  let phase = 'endpoint';
  let step = 'none';
  function endpoint(key: string, user: string): string {
    const value = process.env[key];
    assert(value);
    const url = new URL(value);
    assert.equal(process.env['BUG_008B_DISPOSABLE'], 'new-container');
    assert.equal(url.protocol, 'postgresql:');
    assert.equal(url.hostname, '127.0.0.1');
    assert.equal(url.port, process.env['BUG_008B_PORT']);
    assert.equal(url.pathname, '/clean_migration_proof');
    assert.equal(url.username, user);
    assert.equal(url.searchParams.get('connection_limit'), '1');
    return value;
  }
  const owner = new PrismaClient({ datasources: { db: { url: endpoint('BUG_008B_OWNER_URL', 'fixture_owner') } }, log: [] });
  const app = new PrismaClient({ datasources: { db: { url: endpoint('BUG_008B_RUNTIME_URL', 'proof_runtime') } }, log: [] });
  const app2 = new PrismaClient({ datasources: { db: { url: endpoint('BUG_008B_RUNTIME_URL', 'proof_runtime') } }, log: [] });
  const service = new PrismaClient({ datasources: { db: { url: endpoint('BUG_008B_SERVICE_URL', 'proof_service') } }, log: [] });
  const identityService = new PrismaClient({ datasources: { db: { url: endpoint('BUG_008B_IDENTITY_URL', 'proof_identity') } }, log: [] });
  const otpService = new PrismaClient({ datasources: { db: { url: endpoint('BUG_008B_OTP_URL', 'proof_otp') } }, log: [] });
  const catalogueService = new PrismaClient({ datasources: { db: { url: endpoint('BUG_008B_CATALOGUE_URL', 'proof_catalogue') } }, log: [] });
  let failed: Error | undefined;
  try {
    phase = 'role and catalog invariants';
    const roles = await app.$queryRaw<{ current: string; session: string; superuser: boolean; bypass: boolean; owner: boolean; runtime: boolean; role_set: boolean; extra: bigint }[]>`
      SELECT current_user AS current, session_user AS session, r.rolsuper AS superuser,
        r.rolbypassrls AS bypass, EXISTS (SELECT 1 FROM pg_class c WHERE c.relowner=r.oid AND c.relnamespace='public'::regnamespace) AS owner,
        pg_has_role(current_user,'subtrack_runtime','USAGE') AS runtime,
        pg_has_role(current_user,'subtrack_runtime','SET') AS role_set,
        (SELECT count(*) FROM pg_auth_members m WHERE m.member=r.oid AND m.roleid <> 'subtrack_runtime'::regrole) AS extra
      FROM pg_roles r WHERE r.rolname=current_user`;
    assert.deepEqual(roles, [{ current: 'proof_runtime', session: 'proof_runtime', superuser: false,
      bypass: false, owner: false, runtime: true, role_set: false, extra: 0n }]);
    const privilege = await app.$queryRaw<{ schema_create: boolean; otp: boolean; catalogue_write: boolean; parser: boolean; admin_check: boolean; principal_match: boolean; lookup: boolean; service: boolean }[]>`
      SELECT has_schema_privilege(current_user,'public','CREATE') AS schema_create,
        has_table_privilege(current_user,'public.otp_challenge','SELECT') AS otp,
        has_table_privilege(current_user,'public.merchant','INSERT') AS catalogue_write,
        has_function_privilege(current_user,'public.subtrack_principal()','EXECUTE') AS parser,
        has_function_privilege(current_user,'public.subtrack_active_admin(uuid)','EXECUTE') AS admin_check,
        has_function_privilege(current_user,'public.subtrack_principal_matches(uuid)','EXECUTE') AS principal_match,
        pg_has_role(current_user,'subtrack_visibility_lookup','MEMBER') AS lookup,
        pg_has_role(current_user,'subtrack_invitation_service','MEMBER') AS service`;
    assert.deepEqual(privilege, [{ schema_create: false, otp: false, catalogue_write: false,
      parser: false, admin_check: true, principal_match: true, lookup: false, service: false }]);
    const fixture = JSON.parse(readFileSync('prisma/reconciliation-target.json', 'utf8')) as {
      enums: Record<string,string[]>;
      tables: Record<string,{columns:string[];keys?:string[];foreignKeys?:string[]}>;
      sqlOnlyCatalog: { partialIndexes: [string,string,string,string,boolean][]; checks: string[];
        grants: [string,string,string,boolean][] };
    };
    const enumRows = await owner.$queryRaw<{ name:string; value:string }[]>`
      SELECT t.typname AS name, e.enumlabel AS value FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
      JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' ORDER BY t.typname,e.enumsortorder`;
    for (const [name, values] of Object.entries(fixture.enums))
      assert.deepEqual(enumRows.filter(r => r.name === name).map(r => r.value), values);
    const columnRows = await owner.$queryRaw<{ table_name:string; column_name:string }[]>`
      SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'`;
    for (const [name, table] of Object.entries(fixture.tables))
      for (const column of table.columns)
        assert(columnRows.some(r => r.table_name === name && r.column_name === column.split(' ')[0]));
    const rls = await owner.$queryRaw<{ name:string; rls:boolean }[]>`
      SELECT relname AS name, relrowsecurity AS rls FROM pg_class
      WHERE relnamespace='public'::regnamespace AND relkind='r'`;
    const protectedTables = ['identity','session','household','household_member','invitation','consent','audit_log',
      'subscription','subscription_share','bank_connection','bank_account','raw_transaction','subscription_charge'];
    for (const name of protectedTables) assert.equal(rls.find(r => r.name === name)?.rls, true);
    assert.equal(rls.find(r => r.name === 'otp_challenge')?.rls, false);
    const checks = await owner.$queryRaw<{ name:string }[]>`
      SELECT conname AS name FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype IN ('c','f')`;
    for (const name of [...fixture.sqlOnlyCatalog.checks,
      'bank_account_connection_id_identity_id_fkey','raw_transaction_account_id_identity_id_fkey',
      'subscription_charge_raw_transaction_id_identity_id_fkey'])
      assert(checks.some(c => c.name === name));
    const indexes = await owner.$queryRaw<{ name:string; table_name:string; definition:string }[]>`
      SELECT indexname AS name, tablename AS table_name, indexdef AS definition
      FROM pg_indexes WHERE schemaname='public'`;
    const compact = (value:string) => value.replace(/[()\s"]/g,'').toLowerCase();
    for (const [name, table, columns, predicate, unique] of fixture.sqlOnlyCatalog.partialIndexes) {
      const found=indexes.find(i => i.name===name && i.table_name===table);
      assert(found);
      assert.equal(found.definition.startsWith('CREATE UNIQUE INDEX'),unique);
      assert(found.definition.replaceAll('"','').replaceAll(' ','').includes(`(${columns})`));
      assert.equal(compact(found.definition.split(' WHERE ')[1] ?? ''),compact(predicate));
    }
    for (const [role, table, privilege, expected] of fixture.sqlOnlyCatalog.grants) {
      const actual=await owner.$queryRaw<{allowed:boolean}[]>`
        SELECT has_table_privilege(${role}, ${`public.${table}`}, ${privilege}) AS allowed`;
      assert.equal(actual[0]?.allowed,expected);
    }
    const foreignKeys = await owner.$queryRaw<{table_name:string;definition:string}[]>`
      SELECT c.relname AS table_name, pg_get_constraintdef(k.oid) AS definition
      FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
      WHERE c.relnamespace='public'::regnamespace AND k.contype='f'`;
    for (const [name, table] of Object.entries(fixture.tables)) {
      for (const key of table.keys ?? []) {
        const match=/^(PK|UNIQUE|INDEX)\(([^)]+)\)/.exec(key);
        assert(match);
        const columns=match[2]?.replaceAll(' ','');
        assert(indexes.some(i => i.table_name===name &&
          (match[1]==='INDEX' ? !i.definition.startsWith('CREATE UNIQUE') : i.definition.startsWith('CREATE UNIQUE')) &&
          i.definition.replaceAll('"','').replaceAll(' ','').includes(`(${columns})`)));
      }
      for (const key of table.foreignKeys ?? []) {
        const match=/^\(?([a-z_,]+)\)?->([a-z_]+)\(([^)]+)\)$/.exec(key.replace(/^existing /,'').replaceAll(' ',''));
        assert(match);
        const fragment=`FOREIGNKEY(${match[1]})REFERENCES${match[2]}(${match[3]})`;
        assert(foreignKeys.some(f => f.table_name===name &&
          f.definition.replaceAll('"','').replaceAll(' ','').replaceAll('public.','').includes(fragment)));
      }
    }
    const actualColumns = await owner.$queryRaw<{ table_name:string; column_name:string; type:string; nullable:boolean }[]>`
      SELECT c.relname AS table_name, a.attname AS column_name,
        format_type(a.atttypid,a.atttypmod) AS type, NOT a.attnotnull AS nullable
      FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid
      WHERE c.relnamespace='public'::regnamespace AND c.relkind='r'
        AND a.attnum>0 AND NOT a.attisdropped`;
    for (const [name, table] of Object.entries(fixture.tables)) {
      const actual = actualColumns.filter(c => c.table_name === name);
      assert.equal(actual.length,table.columns.length);
      for (const column of table.columns) {
        const [field,expected] = column.split(' ');
        const found = actual.find(c => c.column_name === field);
        assert(found && expected);
        assert.equal(found.nullable,expected.endsWith('?'));
        const token=expected.slice(0,-1);
        const normalized=found.type.replace('character varying','varchar').replace('character','char')
          .replace(/^timestamp.*with time zone$/,'timestamptz');
        assert.equal(normalized,token);
      }
    }
    phase = 'fixture';
    const a=randomUUID(), b=randomUUID(), c=randomUUID(), d=randomUUID(), h=randomUUID(), otherH=randomUUID();
    const s1=randomUUID(), s2=randomUUID(), s3=randomUUID(), sh=randomUUID(), inv=randomUUID(), inv2=randomUUID(), inv3=randomUUID();
    const bank=randomUUID(), account=randomUUID(), txid=randomUUID(), charge=randomUUID();
    await owner.$executeRaw`INSERT INTO identity(id,auth_method,updated_at) VALUES
      (${a}::uuid,'MOCK',now()),(${b}::uuid,'MOCK',now()),(${c}::uuid,'MOCK',now())`;
    await owner.$transaction(async t => {
      await t.$executeRaw`INSERT INTO household(id,name,updated_at) VALUES
        (${h}::uuid,'synthetic',now()),(${otherH}::uuid,'synthetic',now())`;
      await t.$executeRaw`INSERT INTO household_member(household_id,identity_id,role) VALUES
        (${h}::uuid,${a}::uuid,'ADMIN'),(${h}::uuid,${b}::uuid,'MEMBER'),(${otherH}::uuid,${c}::uuid,'ADMIN')`;
    });
    await owner.$executeRaw`INSERT INTO subscription(id,identity_id,category_code,cadence,expected_amount_minor,currency,source,always_private,updated_at) VALUES
      (${s1}::uuid,${a}::uuid,'TEST','MONTHLY',-100,'SEK','MANUAL',false,now()),
      (${s2}::uuid,${a}::uuid,'TEST','MONTHLY',-200,'SEK','MANUAL',true,now()),
      (${s3}::uuid,${a}::uuid,'TEST','MONTHLY',-300,'SEK','MANUAL',true,now())`;
    await owner.$executeRaw`INSERT INTO consent(identity_id,scope_id,scope_type,open_book,updated_at)
      VALUES (${a}::uuid,${h}::uuid,'HOUSEHOLD',false,now())`;
    await owner.$executeRaw`INSERT INTO bank_connection(id,identity_id,provider,institution_id,institution_name,status,updated_at)
      VALUES (${bank}::uuid,${a}::uuid,'SYNTHETIC','synthetic','synthetic','ACTIVE',now())`;
    await owner.$executeRaw`INSERT INTO bank_connection(id,identity_id,provider,institution_id,institution_name,status,updated_at)
      VALUES (${randomUUID()}::uuid,${a}::uuid,'SYNTHETIC','null-allowed','synthetic','ACTIVE',now())`;
    await owner.$executeRaw`INSERT INTO bank_connection(id,identity_id,provider,provider_connection_id,institution_id,institution_name,status,updated_at)
      VALUES (${randomUUID()}::uuid,${a}::uuid,'SYNTHETIC','unique-proof','named','synthetic','ACTIVE',now())`;
    await assert.rejects(owner.$executeRaw`INSERT INTO bank_connection(id,identity_id,provider,provider_connection_id,institution_id,institution_name,status,updated_at)
      VALUES (${randomUUID()}::uuid,${a}::uuid,'SYNTHETIC','unique-proof','duplicate','synthetic','ACTIVE',now())`);
    await owner.$executeRaw`INSERT INTO bank_account(id,connection_id,identity_id,provider_account_id,name,type,currency,updated_at)
      VALUES (${account}::uuid,${bank}::uuid,${a}::uuid,'synthetic','synthetic','CHECKING','SEK',now())`;
    await owner.$executeRaw`INSERT INTO raw_transaction(id,account_id,identity_id,provider_transaction_id,amount_minor,currency,transaction_date,status,raw_description,is_refund,dedupe_hash,updated_at)
      VALUES (${txid}::uuid,${account}::uuid,${a}::uuid,'synthetic',-100,'SEK','2026-01-01','BOOKED','synthetic',false,'synthetic',now())`;
    await owner.$executeRaw`INSERT INTO subscription_charge(id,identity_id,subscription_id,raw_transaction_id,amount_minor,currency,charged_at,matched_by,updated_at)
      VALUES (${charge}::uuid,${a}::uuid,${s1}::uuid,${txid}::uuid,-100,'SEK','2026-01-01','USER',now())`;
    const rows = async (id: string, table: 'subscription'|'bank_account'|'raw_transaction'|'subscription_charge'|'consent'|'session'|'audit_log') =>
      app.$transaction(async t => {
        await t.$queryRaw`SELECT set_config('app.user_id',${id},true), set_config('app.current_user_id',${id},true)`;
        return t.$queryRawUnsafe<{ id:string }[]>(`SELECT id::text FROM public.${table} ORDER BY id`);
      });
    phase = 'principal isolation and visibility';
    assert.equal((await rows(b,'subscription')).length,0);
    assert.equal((await rows(a,'subscription')).length,3);
    for (const table of ['bank_account','raw_transaction','subscription_charge','consent'] as const)
      assert.equal((await rows(b,table)).length,0);
    await assert.rejects(app.$transaction(async t => {
      await t.$queryRaw`SELECT set_config('app.user_id',${a},true), set_config('app.current_user_id',${a},true)`;
      assert.equal(await t.$executeRaw`INSERT INTO subscription_share(id,subscription_id,household_id,shared_by)
        VALUES (${sh}::uuid,${s2}::uuid,${h}::uuid,${a}::uuid)`,1);
      await t.$executeRaw`INSERT INTO subscription_share(subscription_id,household_id,shared_by)
        VALUES (${s3}::uuid,${otherH}::uuid,${a}::uuid)`;
    })); // whole transaction rolls back, including its otherwise valid share
    await app.$transaction(async t => {
      await t.$queryRaw`SELECT set_config('app.user_id',${a},true), set_config('app.current_user_id',${a},true)`;
      assert.equal(await t.$executeRaw`INSERT INTO subscription_share(id,subscription_id,household_id,shared_by)
        VALUES (${sh}::uuid,${s2}::uuid,${h}::uuid,${a}::uuid)`,1);
    });
    await assert.rejects(owner.$executeRaw`INSERT INTO subscription_share(subscription_id,household_id,shared_by)
      VALUES (${s2}::uuid,${h}::uuid,${a}::uuid)`);
    await assert.rejects(app.$transaction(async t => {
      await t.$queryRaw`SELECT set_config('app.user_id',${a},true), set_config('app.current_user_id',${a},true)`;
      await t.$executeRaw`UPDATE subscription_share SET household_id=${otherH}::uuid WHERE id=${sh}::uuid`;
    }));
    await assert.rejects(app.$transaction(async t => {
      await t.$queryRaw`SELECT set_config('app.user_id',${a},true), set_config('app.current_user_id',${a},true)`;
      await t.$executeRaw`DELETE FROM subscription_share WHERE id=${sh}::uuid`;
    }));
    assert.deepEqual((await rows(b,'subscription')).map(r => r.id),[s2]);
    await owner.$executeRaw`UPDATE consent SET open_book=true WHERE identity_id=${a}::uuid AND scope_id=${h}::uuid`;
    assert.deepEqual(new Set((await rows(b,'subscription')).map(r => r.id)),new Set([s1,s2]));
    assert.equal((await rows(c,'subscription')).length,0);
    phase = 'mutation boundaries';
    const dependantOne=randomUUID(), dependantTwo=randomUUID();
    await app.$transaction(async t => {
      await t.$queryRaw`SELECT set_config('app.user_id',${a},true), set_config('app.current_user_id',${a},true)`;
      assert.equal(await t.$executeRaw`INSERT INTO household_member(id,household_id,identity_id,display_name,role)
        VALUES (${dependantOne}::uuid,${h}::uuid,NULL,'synthetic child 1','DEPENDANT'),
               (${dependantTwo}::uuid,${h}::uuid,NULL,'synthetic child 2','DEPENDANT')`,2);
    });
    const profiles=await owner.$queryRaw<{id:string;identity_id:string|null;display_name:string}[]>`
      SELECT id::text,identity_id::text,display_name FROM household_member
      WHERE id IN (${dependantOne}::uuid,${dependantTwo}::uuid) ORDER BY display_name`;
    assert.deepEqual(profiles.map(p => [p.id,p.identity_id,p.display_name]),
      [[dependantOne,null,'synthetic child 1'],[dependantTwo,null,'synthetic child 2']]);
    assert.equal((await rows(dependantOne,'subscription')).length,0);
    for (const principal of [b,c]) await assert.rejects(app.$transaction(async t => {
      await t.$queryRaw`SELECT set_config('app.user_id',${principal},true), set_config('app.current_user_id',${principal},true)`;
      await t.$executeRaw`INSERT INTO household_member(household_id,identity_id,display_name,role)
        VALUES (${h}::uuid,NULL,'denied','DEPENDANT')`;
    }));
    await assert.rejects(owner.$executeRaw`INSERT INTO household_member(household_id,identity_id,role)
      VALUES (${h}::uuid,NULL,'MEMBER')`);
    await assert.rejects(owner.$executeRaw`INSERT INTO household_member(household_id,identity_id,role)
      VALUES (${h}::uuid,NULL,'ADMIN')`);
    await assert.rejects(owner.$executeRaw`INSERT INTO household_member(household_id,identity_id,display_name,role)
      VALUES (${h}::uuid,${c}::uuid,'denied','DEPENDANT')`);
    await assert.rejects(owner.$executeRaw`INSERT INTO household_member(household_id,identity_id,role)
      VALUES (${h}::uuid,NULL,'DEPENDANT')`);
    for (const role of ['MEMBER','ADMIN'] as const) {
      await assert.rejects(app.$transaction(async t => {
        await t.$queryRaw`SELECT set_config('app.user_id',${a},true), set_config('app.current_user_id',${a},true)`;
        await t.$executeRaw`INSERT INTO household_member(household_id,identity_id,role)
          VALUES (${h}::uuid,${c}::uuid,${role}::member_role)`;
      }));
    }
    await app.$transaction(async t => {
      await t.$queryRaw`SELECT set_config('app.user_id',${b},true), set_config('app.current_user_id',${b},true)`;
      assert.equal(await t.$executeRaw`UPDATE subscription SET custom_name='denied' WHERE id=${s1}::uuid`,0);
      assert.equal(await t.$executeRaw`DELETE FROM raw_transaction WHERE id=${txid}::uuid`,0);
    });
    await assert.rejects(app.$transaction(async t => {
      await t.$queryRaw`SELECT set_config('app.user_id',${b},true), set_config('app.current_user_id',${b},true)`;
      await t.$executeRaw`UPDATE household_member SET role='ADMIN' WHERE identity_id=${b}::uuid`;
    }));
    await assert.rejects(owner.$executeRaw`UPDATE raw_transaction SET amount_minor=-999 WHERE id=${txid}::uuid`);
    await assert.rejects(owner.$executeRaw`UPDATE subscription_charge SET amount_minor=-999 WHERE id=${charge}::uuid`);
    await assert.rejects(owner.$executeRaw`INSERT INTO subscription_charge(identity_id,subscription_id,raw_transaction_id,amount_minor,currency,charged_at,matched_by,updated_at)
      VALUES (${b}::uuid,${s1}::uuid,${txid}::uuid,-100,'SEK','2026-01-01','USER',now())`);
    await assert.rejects(owner.$executeRaw`UPDATE subscription SET confidence=1.0001 WHERE id=${s1}::uuid`);
    await assert.rejects(owner.$executeRaw`UPDATE raw_transaction SET original_amount_minor=-10 WHERE id=${txid}::uuid`);
    phase = 'concurrent source and admin guards';
    const awaitBlock = async (marker:string) => {
      for (let i=0;i<120;i++) {
        const state=await owner.$queryRaw<{blocked:boolean}[]>`SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE application_name=${marker}
            AND cardinality(pg_blocking_pids(pid)) > 0) AS blocked`;
        if (state[0]?.blocked) return;
        await new Promise(resolve => setTimeout(resolve,25));
      }
      throw new Error('Expected second LOGIN to block on the shared row');
    };
    for (const isolation of ['READ COMMITTED','REPEATABLE READ'] as const) {
      const level = isolation === 'READ COMMITTED' ? 'rc' : 'rr';
      const raceTx=randomUUID(), raceCharge=randomUUID(), marker=randomUUID();
      step = `${level}-source-seed`;
      await owner.$executeRaw`INSERT INTO raw_transaction(id,account_id,identity_id,provider_transaction_id,amount_minor,currency,transaction_date,status,raw_description,is_refund,dedupe_hash,updated_at)
        VALUES (${raceTx}::uuid,${account}::uuid,${a}::uuid,${raceTx},-50,'SEK','2026-01-02','BOOKED','synthetic',false,${raceTx},now())`;
      let acquired!: () => void, release!: () => void;
      const locked=new Promise<void>(resolve => { acquired=resolve; });
      const hold=new Promise<void>(resolve => { release=resolve; });
      const capture=app.$transaction(async t => {
        await t.$executeRawUnsafe(`SET TRANSACTION ISOLATION LEVEL ${isolation}`);
        await t.$queryRaw`SELECT set_config('app.user_id',${a},true), set_config('app.current_user_id',${a},true)`;
        await t.$executeRaw`INSERT INTO subscription_charge(id,identity_id,subscription_id,raw_transaction_id,amount_minor,currency,charged_at,matched_by,updated_at)
          VALUES (${raceCharge}::uuid,${a}::uuid,${s1}::uuid,${raceTx}::uuid,-50,'SEK','2026-01-02','USER',now())`;
        acquired();
        await hold;
      }, { timeout: 15_000 });
      step = `${level}-capture`;
      await Promise.race([locked,capture]);
      const edit=app2.$transaction(async t => {
        await t.$executeRawUnsafe(`SET TRANSACTION ISOLATION LEVEL ${isolation}`);
        await t.$queryRaw`SELECT set_config('application_name',${marker},true), set_config('app.user_id',${a},true), set_config('app.current_user_id',${a},true)`;
        await t.$executeRaw`UPDATE raw_transaction SET amount_minor=-51 WHERE id=${raceTx}::uuid`;
      }, { timeout: 15_000 });
      step = `${level}-source-await-block`;
      try { await awaitBlock(marker); } finally { release(); }
      step = `${level}-source-edit-assert`;
      await capture;
      await assert.rejects(edit);
      const financial=await owner.$queryRaw<{amount_minor:bigint}[]>`SELECT amount_minor FROM raw_transaction WHERE id=${raceTx}::uuid`;
      assert.equal(financial[0]?.amount_minor,-50n);

      const e=randomUUID(), f=randomUUID(), raceHousehold=randomUUID(), adminMarker=randomUUID();
      step = `${level}-admin-seed`;
      await owner.$executeRaw`INSERT INTO identity(id,auth_method,updated_at) VALUES
        (${e}::uuid,'MOCK',now()),(${f}::uuid,'MOCK',now())`;
      await owner.$transaction(async t => {
        await t.$executeRaw`INSERT INTO household(id,name,updated_at) VALUES (${raceHousehold}::uuid,'race synthetic',now())`;
        await t.$executeRaw`INSERT INTO household_member(household_id,identity_id,role) VALUES
          (${raceHousehold}::uuid,${e}::uuid,'ADMIN'),(${raceHousehold}::uuid,${f}::uuid,'ADMIN')`;
      });
      let adminAcquired!: () => void, adminRelease!: () => void;
      const adminLocked=new Promise<void>(resolve => { adminAcquired=resolve; });
      const adminHold=new Promise<void>(resolve => { adminRelease=resolve; });
      const first=app.$transaction(async t => {
        await t.$executeRawUnsafe(`SET TRANSACTION ISOLATION LEVEL ${isolation}`);
        await t.$queryRaw`SELECT set_config('app.user_id',${e},true), set_config('app.current_user_id',${e},true)`;
        assert.equal(await t.$executeRaw`UPDATE household_member SET left_at=now()
          WHERE household_id=${raceHousehold}::uuid AND identity_id=${e}::uuid`,1);
        adminAcquired();
        await adminHold;
      }, { timeout: 15_000 });
      step = `${level}-admin-first`;
      await Promise.race([adminLocked,first]);
      const second=app2.$transaction(async t => {
        await t.$executeRawUnsafe(`SET TRANSACTION ISOLATION LEVEL ${isolation}`);
        await t.$queryRaw`SELECT set_config('application_name',${adminMarker},true), set_config('app.user_id',${f},true), set_config('app.current_user_id',${f},true)`;
        await t.$executeRaw`UPDATE household_member SET left_at=now()
          WHERE household_id=${raceHousehold}::uuid AND identity_id=${f}::uuid`;
      }, { timeout: 15_000 });
      step = `${level}-admin-await-block`;
      try { await awaitBlock(adminMarker); } finally { adminRelease(); }
      step = `${level}-admin-second-assert`;
      await first;
      await assert.rejects(second);
      const admins=await owner.$queryRaw<{ count:bigint }[]>`SELECT count(*) AS count FROM household_member
        WHERE household_id=${raceHousehold}::uuid AND role='ADMIN' AND left_at IS NULL`;
      assert.equal(admins[0]?.count,1n);
    }
    phase = 'mutation boundaries';
    const sessionId=randomUUID(), otpId=randomUUID(), merchantId=randomUUID(), planId=randomUUID();
    await app.$transaction(async t => {
      await t.$queryRaw`SELECT set_config('app.user_id',${a},true), set_config('app.current_user_id',${a},true)`;
      assert.equal(await t.$executeRaw`INSERT INTO session(id,identity_id,device_name,refresh_token_hash,family_id)
        VALUES (${sessionId}::uuid,${a}::uuid,'synthetic','synthetic-hash',${randomUUID()}::uuid)`,1);
      assert.equal(await t.$executeRaw`INSERT INTO audit_log(actor_id,household_id,event_type)
        VALUES (${a}::uuid,${h}::uuid,'SYNTHETIC')`,1);
      assert.equal(await t.$executeRaw`UPDATE consent SET open_book=false WHERE identity_id=${a}::uuid`,1);
    });
    assert.equal((await rows(b,'session')).length,0);
    assert.equal((await rows(b,'audit_log')).length,0);
    await assert.rejects(app.$transaction(async t => {
      await t.$queryRaw`SELECT set_config('app.user_id',${b},true), set_config('app.current_user_id',${b},true)`;
      await t.$executeRaw`INSERT INTO audit_log(actor_id,event_type) VALUES (${a}::uuid,'FORGED')`;
    }));
    await assert.rejects(app.$transaction(async t => {
      await t.$queryRaw`SELECT set_config('app.user_id',${a},true), set_config('app.current_user_id',${a},true)`;
      await t.$executeRaw`UPDATE audit_log SET event_type='FORGED' WHERE actor_id=${a}::uuid`;
    }));
    assert.equal(await otpService.$executeRaw`INSERT INTO otp_challenge(id,identifier,code_hash,salt,expires_at)
      VALUES (${otpId}::uuid,'synthetic@example.invalid',repeat('a',64),repeat('b',32),now()+interval '1 minute')`,1);
    assert.equal((await otpService.$queryRaw<{id:string}[]>`SELECT id FROM otp_challenge WHERE id=${otpId}::uuid`).length,1);
    await assert.rejects(app.$queryRaw`SELECT id FROM otp_challenge`);
    await assert.rejects(otpService.$queryRaw`SELECT id FROM identity`);
    assert.equal(await catalogueService.$executeRaw`INSERT INTO merchant(id,canonical_name,slug,category_code,aliases,country,updated_at)
      VALUES (${merchantId}::uuid,'synthetic','proof-synthetic','TEST','[]'::jsonb,'SE',now())`,1);
    assert.equal((await app.$queryRaw<{id:string}[]>`SELECT id FROM merchant WHERE id=${merchantId}::uuid`).length,1);
    assert.equal((await catalogueService.$queryRaw<{id:string}[]>`SELECT id FROM merchant WHERE id=${merchantId}::uuid`).length,1);
    assert.equal(await catalogueService.$executeRaw`UPDATE merchant SET canonical_name='synthetic revised' WHERE id=${merchantId}::uuid`,1);
    assert.equal(await catalogueService.$executeRaw`INSERT INTO catalogue_plan
      (id,merchant_id,plan_name,cadence,price_minor,currency,market,source,updated_at)
      VALUES (${planId}::uuid,${merchantId}::uuid,'synthetic','MONTHLY',100,'SEK','SE','MANUAL',now())`,1);
    assert.equal((await app.$queryRaw<{id:string}[]>`SELECT id FROM catalogue_plan WHERE id=${planId}::uuid`).length,1);
    assert.equal((await catalogueService.$queryRaw<{id:string}[]>`SELECT id FROM catalogue_plan WHERE id=${planId}::uuid`).length,1);
    assert.equal(await catalogueService.$executeRaw`UPDATE catalogue_plan SET price_minor=101 WHERE id=${planId}::uuid`,1);
    await assert.rejects(app.$executeRaw`INSERT INTO merchant(id,canonical_name,slug,category_code,aliases,country,updated_at)
      VALUES (${randomUUID()}::uuid,'denied','proof-denied','TEST','[]'::jsonb,'SE',now())`);
    await assert.rejects(app.$executeRaw`UPDATE merchant SET canonical_name='denied' WHERE id=${merchantId}::uuid`);
    await assert.rejects(app.$executeRaw`DELETE FROM merchant WHERE id=${merchantId}::uuid`);
    await assert.rejects(app.$executeRaw`INSERT INTO catalogue_plan
      (id,merchant_id,plan_name,cadence,price_minor,currency,market,source,updated_at)
      VALUES (${randomUUID()}::uuid,${merchantId}::uuid,'denied','MONTHLY',100,'SEK','SE','MANUAL',now())`);
    await assert.rejects(app.$executeRaw`UPDATE catalogue_plan SET price_minor=102 WHERE id=${planId}::uuid`);
    await assert.rejects(app.$executeRaw`DELETE FROM catalogue_plan WHERE id=${planId}::uuid`);
    assert.equal(await catalogueService.$executeRaw`DELETE FROM catalogue_plan WHERE id=${planId}::uuid`,1);
    assert.equal(await catalogueService.$executeRaw`DELETE FROM merchant WHERE id=${merchantId}::uuid`,1);
    await owner.$executeRaw`INSERT INTO invitation(id,household_id,inviter_id,channel,token_hash,expires_at,updated_at)
      VALUES (${inv}::uuid,${h}::uuid,${a}::uuid,'LINK','synthetic1',now()+interval '1 day',now()),
             (${inv2}::uuid,${h}::uuid,${a}::uuid,'LINK','synthetic2',now()+interval '1 day',now())`;
    await owner.$executeRaw`INSERT INTO invitation(id,household_id,inviter_id,invitee_id,channel,token_hash,expires_at,updated_at)
      VALUES (${inv3}::uuid,${h}::uuid,${a}::uuid,${c}::uuid,'LINK','synthetic3',now()+interval '1 day',now())`;
    await assert.rejects(app.$transaction(async t => {
      await t.$queryRaw`SELECT set_config('app.user_id',${a},true), set_config('app.current_user_id',${a},true)`;
      await t.$executeRaw`UPDATE invitation SET status='ACCEPTED',invitee_id=${c}::uuid WHERE id=${inv}::uuid`;
    }));
    phase = 'service invitation lifecycle';
    step = 'lifecycle-identity';
    assert.equal((await service.$queryRaw<{id:string}[]>`SELECT id FROM invitation WHERE id=${inv}::uuid`).length,1);
    const provisioned = await identityService.$queryRaw<{id:string}[]>`INSERT INTO identity(id,auth_method,updated_at)
      VALUES (${d}::uuid,'MOCK',now()) RETURNING id::text`;
    assert.deepEqual(provisioned,[{id:d}]);
    await assert.rejects(service.$queryRaw`SELECT external_id FROM identity`);
    await assert.rejects(service.$executeRaw`INSERT INTO identity(id,auth_method,updated_at) VALUES (${randomUUID()}::uuid,'MOCK',now())`);
    await assert.rejects(identityService.$queryRaw`SELECT email FROM identity`);
    step = 'lifecycle-transitions';
    await assert.rejects(service.$executeRaw`UPDATE invitation SET status='ACCEPTED',invitee_id=${d}::uuid,updated_at=now()
      WHERE id=${inv3}::uuid`);
    assert.equal(await service.$executeRaw`UPDATE invitation SET status='ACCEPTED',updated_at=now()
      WHERE id=${inv3}::uuid`,1);
    assert.equal(await service.$executeRaw`UPDATE invitation SET status='DECLINED',invitee_id=${c}::uuid,updated_at=now()
      WHERE id=${inv2}::uuid`,1);
    assert.equal(await service.$executeRaw`UPDATE invitation SET status='ACCEPTED',invitee_id=${d}::uuid,updated_at=now()
      WHERE id=${inv}::uuid`,1);
    step = 'lifecycle-effects';
    assert.equal(await service.$executeRaw`INSERT INTO household_member(household_id,identity_id,role)
      VALUES (${h}::uuid,${d}::uuid,'MEMBER')`,1);
    assert.equal(await service.$executeRaw`INSERT INTO audit_log(actor_id,household_id,event_type,payload)
      VALUES (${d}::uuid,${h}::uuid,'INVITATION_ACCEPTED',jsonb_build_object('invitationId',${inv}::text))`,1);
    step = 'lifecycle-replay';
    assert.equal(await service.$executeRaw`UPDATE invitation SET status='PENDING' WHERE id=${inv}::uuid`,0);
    assert.deepEqual(await service.$queryRaw<{status:string}[]>`SELECT status FROM invitation WHERE id=${inv}::uuid`,
      [{status:'ACCEPTED'}]);
    phase = 'owner departure and revocation';
    await assert.rejects(app.$transaction(async t => {
      await t.$queryRaw`SELECT set_config('app.user_id',${c},true), set_config('app.current_user_id',${c},true)`;
      await t.$executeRaw`UPDATE household_member SET left_at=now() WHERE household_id=${otherH}::uuid AND identity_id=${c}::uuid`;
    }));
    await app.$transaction(async t => {
      await t.$queryRaw`SELECT set_config('app.user_id',${a},true), set_config('app.current_user_id',${a},true)`;
      assert.equal(await t.$executeRaw`UPDATE household_member SET role='ADMIN' WHERE identity_id=${b}::uuid`,1);
      assert.equal(await t.$executeRaw`UPDATE household_member SET left_at=now() WHERE identity_id=${a}::uuid`,1);
      assert.equal(await t.$executeRaw`UPDATE subscription_share SET revoked_at=now() WHERE id=${sh}::uuid`,1);
      assert.equal(await t.$executeRaw`UPDATE subscription_share SET revoked_at=now() WHERE id=${sh}::uuid`,0);
    });
    assert.equal((await rows(b,'subscription')).length,0);
    await app.$transaction(async t => {
      await t.$queryRaw`SELECT set_config('app.user_id',${d},true), set_config('app.current_user_id',${d},true)`;
      assert.equal(await t.$executeRaw`UPDATE household_member SET left_at=now() WHERE household_id=${h}::uuid AND identity_id=${d}::uuid`,1);
    });
    const newHousehold = randomUUID();
    await app.$transaction(async t => {
      await t.$queryRaw`SELECT set_config('app.user_id',${a},true), set_config('app.current_user_id',${a},true)`;
      const created = await t.$queryRaw<{id:string}[]>`INSERT INTO household(id,name,updated_at)
        VALUES (${newHousehold}::uuid,'new synthetic',now()) RETURNING id::text`;
      assert.deepEqual(created,[{id:newHousehold}]);
      assert.equal(await t.$executeRaw`INSERT INTO household_member(household_id,identity_id,role)
        VALUES (${newHousehold}::uuid,${a}::uuid,'ADMIN')`,1);
    });
    phase = 'context failure and rollback cleanup';
    const noContext = await app.$queryRaw<{ id:string }[]>`SELECT id::text FROM subscription`;
    assert.deepEqual(noContext,[]);
    for (const [left,right] of [['bad','bad'],[a,b],[a,'bad']]) {
      await app.$transaction(async t => {
        await t.$queryRaw`SELECT set_config('app.user_id',${left},true), set_config('app.current_user_id',${right},true)`;
        assert.deepEqual(await t.$queryRaw`SELECT id FROM subscription`,[]);
      });
    }
    assert.deepEqual(await app.$queryRaw`SELECT id FROM subscription`,[]);
    assert.equal((await rows(a,'subscription')).length,3);
    assert.deepEqual(await app.$queryRaw`SELECT id FROM subscription`,[]);
  } catch (error) {
    const detail = error && typeof error === 'object' ? error as { code?: unknown; meta?: { code?: unknown } } : {};
    const candidate = detail.meta?.code ?? detail.code;
    const code = typeof candidate === 'string' && /^(?:P[0-9]{4}|[0-9A-Z]{5})$/.test(candidate)
      ? candidate : 'unavailable';
    failed = new Error(`BUG-008b disposable PostgreSQL proof failed: ${phase}; step=${phase === 'concurrent source and admin guards' || phase === 'service invitation lifecycle' ? step : 'none'}; code=${code}`);
  }
  const closed = await Promise.allSettled([owner.$disconnect(),app.$disconnect(),app2.$disconnect(),service.$disconnect(),
    identityService.$disconnect(),otpService.$disconnect(),catalogueService.$disconnect()]);
  if (failed) throw failed;
  if (closed.some(r => r.status === 'rejected')) throw new Error('BUG-008b disposable client cleanup failed');
}, 90_000);
