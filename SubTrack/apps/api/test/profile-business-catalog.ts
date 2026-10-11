import type { PrismaClient } from '@prisma/client';

// A fixed, data-free projection used by both disposable install paths. Keep
// definitions verbatim: normalizing policy SQL, checks, defaults or grantees
// could hide a business-schema difference. The two migration-owner role names
// are installation details, so only that owner name is normalized.
export async function readProfileBusinessCatalog(db: PrismaClient) {
  const columns = await db.$queryRaw<{
    table_name:string; name:string; position:number; type:string; nullable:boolean; default_value:string|null;
  }[]>`
    SELECT c.relname AS table_name, a.attname AS name, a.attnum AS position,
      pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,
      NOT a.attnotnull AS nullable,
      pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS default_value
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    WHERE n.nspname='public' AND
      (c.relname='identity_profile' OR (c.relname='identity' AND a.attname IN ('verified_at','given_name','surname')))
    ORDER BY c.relname,a.attnum`;
  const constraints = await db.$queryRaw<{
    table_name:string; name:string; kind:string; definition:string; update_action:string|null;
    delete_action:string|null; deferrable:boolean; deferred:boolean; validated:boolean;
  }[]>`
    SELECT c.relname AS table_name,k.conname AS name,k.contype AS kind,
      pg_catalog.pg_get_constraintdef(k.oid,false) AS definition,
      CASE WHEN k.contype='f' THEN k.confupdtype::text ELSE NULL END AS update_action,
      CASE WHEN k.contype='f' THEN k.confdeltype::text ELSE NULL END AS delete_action,
      k.condeferrable AS deferrable,k.condeferred AS deferred,k.convalidated AS validated
    FROM pg_catalog.pg_constraint k JOIN pg_catalog.pg_class c ON c.oid=k.conrelid
    WHERE c.oid='public.identity_profile'::pg_catalog.regclass
    ORDER BY k.conname`;
  const relation = await db.$queryRaw<{rls:boolean;force_rls:boolean;kind:string}[]>`
    SELECT relrowsecurity AS rls,relforcerowsecurity AS force_rls,relkind::text AS kind
    FROM pg_catalog.pg_class WHERE oid='public.identity_profile'::pg_catalog.regclass`;
  const policies = await db.$queryRaw<{
    name:string;command:string;permissive:boolean;roles:string[];using_expr:string|null;check_expr:string|null;
  }[]>`
    SELECT p.polname AS name,p.polcmd::text AS command,p.polpermissive AS permissive,
      ARRAY(SELECT r.rolname FROM pg_catalog.pg_roles r WHERE r.oid=ANY(p.polroles) ORDER BY r.rolname) AS roles,
      pg_catalog.pg_get_expr(p.polqual,p.polrelid) AS using_expr,
      pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid) AS check_expr
    FROM pg_catalog.pg_policy p WHERE p.polrelid='public.identity_profile'::pg_catalog.regclass
    ORDER BY p.polname`;
  const tableAcl = await db.$queryRaw<{
    grantee:string;grantor:string;privilege:string;grantable:boolean;
  }[]>`
    SELECT CASE WHEN x.grantee=0 THEN 'PUBLIC' WHEN x.grantee=c.relowner THEN 'TABLE_OWNER'
      ELSE pg_catalog.pg_get_userbyid(x.grantee) END AS grantee,
      CASE WHEN x.grantor=c.relowner THEN 'TABLE_OWNER' ELSE pg_catalog.pg_get_userbyid(x.grantor) END AS grantor,
      x.privilege_type AS privilege,x.is_grantable AS grantable
    FROM pg_catalog.pg_class c CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) x
    WHERE c.oid='public.identity_profile'::pg_catalog.regclass
    ORDER BY grantee,grantor,privilege,grantable`;
  const columnAcl = await db.$queryRaw<{
    name:string;grantee:string;grantor:string;privilege:string;grantable:boolean;
  }[]>`
    SELECT a.attname AS name,
      CASE WHEN x.grantee=0 THEN 'PUBLIC' WHEN x.grantee=c.relowner THEN 'TABLE_OWNER'
        ELSE pg_catalog.pg_get_userbyid(x.grantee) END AS grantee,
      CASE WHEN x.grantor=c.relowner THEN 'TABLE_OWNER' ELSE pg_catalog.pg_get_userbyid(x.grantor) END AS grantor,
      x.privilege_type AS privilege,x.is_grantable AS grantable
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
      AND a.attnum>0 AND NOT a.attisdropped
    CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) x
    WHERE c.oid='public.identity_profile'::pg_catalog.regclass
    ORDER BY name,grantee,grantor,privilege,grantable`;
  const subscription = await db.$queryRaw<{
    kind:string;rls:boolean;force_rls:boolean;runtime_not_owner:boolean;runtime_bypass_rls:boolean;
    runtime_select:boolean;runtime_update:boolean;merchant_select:boolean;
  }[]>`
    SELECT c.relkind::text AS kind,c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls,
      c.relowner<>r.oid AS runtime_not_owner,r.rolbypassrls AS runtime_bypass_rls,
      has_table_privilege('subtrack_runtime','public.subscription','SELECT') AS runtime_select,
      has_table_privilege('subtrack_runtime','public.subscription','UPDATE') AS runtime_update,
      has_table_privilege('subtrack_runtime','public.merchant','SELECT') AS merchant_select
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_roles o ON o.oid=c.relowner
    CROSS JOIN pg_catalog.pg_roles r
    WHERE c.oid='public.subscription'::pg_catalog.regclass AND r.rolname='subtrack_runtime'`;
  const subscriptionPolicies = await db.$queryRaw<{
    name:string;command:string;permissive:boolean;roles:string[];using_expr:string|null;check_expr:string|null;
  }[]>`
    SELECT p.polname AS name,p.polcmd::text AS command,p.polpermissive AS permissive,
      ARRAY(SELECT r.rolname FROM pg_catalog.pg_roles r WHERE r.oid=ANY(p.polroles) ORDER BY r.rolname) AS roles,
      pg_catalog.pg_get_expr(p.polqual,p.polrelid) AS using_expr,
      pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid) AS check_expr
    FROM pg_catalog.pg_policy p WHERE p.polrelid='public.subscription'::pg_catalog.regclass
    ORDER BY p.polname`;
  return {columns,constraints,relation,policies,tableAcl,columnAcl,subscription,subscriptionPolicies};
}

export type ProfileBusinessCatalog = Awaited<ReturnType<typeof readProfileBusinessCatalog>>;
