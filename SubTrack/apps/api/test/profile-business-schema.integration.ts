import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { test } from 'vitest';
import { readProfileBusinessCatalog } from './profile-business-catalog';

test('ordinary profile business catalog and owner RLS', async () => {
  assert.equal(process.env['BUG_008B_DISPOSABLE'], 'new-container');
  const ownerUrl = process.env['BUG_008B_OWNER_URL'];
  const runtimeUrl = process.env['BUG_008B_RUNTIME_URL'];
  assert(ownerUrl && runtimeUrl);
  const owner = new PrismaClient({ datasources: { db: { url: ownerUrl } }, log: [] });
  const runtime = new PrismaClient({ datasources: { db: { url: runtimeUrl } }, log: [] });
  try {
    const columns = await owner.$queryRaw<{ name: string; type: string; nullable: string; default_value: string | null }[]>`
      SELECT a.attname AS name, format_type(a.atttypid,a.atttypmod) AS type,
        CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END AS nullable,
        pg_get_expr(d.adbin,d.adrelid) AS default_value
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
      LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
      WHERE c.oid='public.identity_profile'::regclass AND a.attnum>0 AND NOT a.attisdropped`;
    const expected = new Map([
      ['identity_id',['uuid','NO']], ['display_name',['character varying(120)','YES']],
      ['avatar_color',['character varying(32)','YES']], ['avatar_emoji',['character varying(32)','YES']],
      ['language',['character varying(2)','NO']], ['theme',['character varying(16)','NO']],
      ['default_currency',['character(3)','NO']], ['profile_complete',['boolean','NO']],
      ['created_at',['timestamp with time zone','NO']], ['updated_at',['timestamp with time zone','NO']],
      ['onboarding_mode',['character varying(16)','YES']],
    ]);
    assert.equal(columns.length, expected.size);
    for (const c of columns) assert.deepEqual([c.type,c.nullable], expected.get(c.name));
    for (const [name,value] of [['language',"'en'"],['theme',"'system'"],['default_currency',"'SEK'"],['profile_complete','false'],['created_at','now()'],['updated_at','now()']] as const)
      assert(columns.find(c => c.name===name)?.default_value?.includes(value));
    const catalog = await owner.$queryRaw<{ rls: boolean; force_rls: boolean; policy_count: bigint; pk: bigint; fk: bigint; checks: bigint }[]>`
      SELECT c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls,
        (SELECT count(*) FROM pg_policy WHERE polrelid=c.oid AND polname IN ('identity_profile_select','identity_profile_insert','identity_profile_update')) AS policy_count,
        (SELECT count(*) FROM pg_constraint WHERE conrelid=c.oid AND contype='p') AS pk,
        (SELECT count(*) FROM pg_constraint WHERE conrelid=c.oid AND contype='f' AND confdeltype='r' AND confupdtype='r') AS fk,
        (SELECT count(*) FROM pg_constraint WHERE conrelid=c.oid AND contype='c') AS checks
      FROM pg_class c WHERE c.oid='public.identity_profile'::regclass`;
    assert.deepEqual(catalog,[{rls:true,force_rls:true,policy_count:3n,pk:1n,fk:1n,checks:4n}]);
    const policies = await owner.$queryRaw<{name:string; command:string; roles:string[]; using_expr:string|null; check_expr:string|null}[]>`
      SELECT p.polname AS name,p.polcmd AS command,
        ARRAY(SELECT rolname FROM pg_roles WHERE oid=ANY(p.polroles)) AS roles,
        pg_get_expr(p.polqual,p.polrelid) AS using_expr,pg_get_expr(p.polwithcheck,p.polrelid) AS check_expr
      FROM pg_policy p WHERE p.polrelid='public.identity_profile'::regclass ORDER BY p.polname`;
    assert.deepEqual(policies.map(p=>[p.name,p.command,p.roles]),[
      ['identity_profile_insert','a',['subtrack_runtime']],
      ['identity_profile_select','r',['subtrack_runtime']],
      ['identity_profile_update','w',['subtrack_runtime']]]);
    for (const p of policies) {
      if (p.command !== 'a') assert.equal(p.using_expr,'subtrack_principal_matches(identity_id)');
      if (p.command !== 'r') assert.equal(p.check_expr,'subtrack_principal_matches(identity_id)');
    }
    const grants = await owner.$queryRaw<{runtime_select:boolean;runtime_insert:boolean;public_select:boolean;identity_select:boolean;otp_select:boolean;currency_update:boolean;mode_update:boolean;identity_update:boolean}[]>`
      SELECT has_table_privilege('subtrack_runtime','public.identity_profile','SELECT') AS runtime_select,
        has_table_privilege('subtrack_runtime','public.identity_profile','INSERT') AS runtime_insert,
        EXISTS (SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) acl WHERE c.oid='public.identity_profile'::regclass AND acl.grantee=0 AND acl.privilege_type='SELECT') AS public_select,
        has_table_privilege('subtrack_identity_provisioner','public.identity_profile','SELECT') AS identity_select,
        has_table_privilege('subtrack_otp_service','public.identity_profile','SELECT') AS otp_select,
        has_column_privilege('subtrack_runtime','public.identity_profile','default_currency','UPDATE') AS currency_update,
        has_column_privilege('subtrack_runtime','public.identity_profile','onboarding_mode','UPDATE') AS mode_update,
        has_column_privilege('subtrack_runtime','public.identity_profile','identity_id','UPDATE') AS identity_update`;
    assert.deepEqual(grants,[{runtime_select:true,runtime_insert:true,public_select:false,identity_select:false,otp_select:false,currency_update:true,mode_update:true,identity_update:false}]);
    const a=randomUUID(), b=randomUUID();
    await owner.$executeRaw`INSERT INTO identity(id,auth_method,updated_at) VALUES (${a}::uuid,'MOCK',now()),(${b}::uuid,'MOCK',now())`;
    await owner.$executeRaw`INSERT INTO identity_profile(identity_id) VALUES (${a}::uuid),(${b}::uuid)`;
    const scoped = async (first:string|null,second:string|null) => runtime.$transaction(async tx => {
      if (first!==null) await tx.$queryRaw`SELECT set_config('app.user_id',${first},true)`;
      if (second!==null) await tx.$queryRaw`SELECT set_config('app.current_user_id',${second},true)`;
      const rows=await tx.$queryRaw<{identity_id:string}[]>`SELECT identity_id FROM identity_profile ORDER BY identity_id`;
      const changed=await tx.$executeRaw`UPDATE identity_profile SET theme='dark' WHERE identity_id=${b}::uuid`;
      return {rows,changed};
    });
    const own=await scoped(a,a);
    assert.deepEqual(own.rows.map(r=>r.identity_id),[a]);
    assert.equal(own.changed,0);
    for (const [x,y] of [[null,null],[a,null],[a,b],['bad','bad']] as const) {
      const denied=await scoped(x,y);
      assert.deepEqual(denied.rows,[]);
      assert.equal(denied.changed,0);
    }
    await assert.rejects(runtime.$executeRaw`UPDATE identity_profile SET identity_id=${a}::uuid`);
    const catalogOutput = process.env['ST237_ORDINARY_PROFILE_CATALOG_OUT'];
    if (catalogOutput !== undefined) {
      const runnerTemp = process.env['RUNNER_TEMP'];
      assert(runnerTemp);
      assert.equal(catalogOutput, resolve(runnerTemp,'st237-ordinary-profile-catalog.json'));
      const catalog = await readProfileBusinessCatalog(owner);
      assert.equal(catalog.columns.length, 14);
      assert.equal(catalog.relation.length, 1);
      assert.equal(catalog.policies.length, 3);
      assert.deepEqual(catalog.subscription,[{kind:'r',rls:true,force_rls:true,runtime_not_owner:true,
        runtime_bypass_rls:false,runtime_select:true,runtime_update:true,merchant_select:true}]);
      assert.deepEqual(catalog.subscriptionPolicies.map(p => p.name),
        ['subscription_delete','subscription_insert','subscription_select','subscription_update']);
      writeFileSync(catalogOutput, JSON.stringify({catalog}), {flag:'wx',mode:0o600});
    }
  } finally {
    await Promise.all([owner.$disconnect(),runtime.$disconnect()]);
  }
});
