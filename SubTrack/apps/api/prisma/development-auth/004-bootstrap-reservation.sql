-- ST-233d: incomplete private bootstrap reservation; pruning/adapter remain separate.
BEGIN;
SET LOCAL search_path = pg_catalog;
SELECT 1 / COALESCE((pg_catalog.current_database() IN ('st233a_development_auth_foundation_proof','st237_private_https_profile')
  AND SESSION_USER = 'st233a_fixture_owner'
  AND pg_catalog.current_setting('server_version_num')::pg_catalog.int4 BETWEEN 160000 AND 169999
  AND EXISTS (SELECT 1 FROM public.st233a_fixture_control WHERE task='ST-233a'
    AND head=pg_catalog.current_setting('st233a.head') AND marker=pg_catalog.current_setting('st233a.marker') AND marker ~ '^[a-f0-9]{32}$')
  AND (SELECT nspowner='subtrack_auth_owner'::pg_catalog.regrole FROM pg_catalog.pg_namespace WHERE nspname='subtrack_auth')
  AND (SELECT count(*)=1 AND bool_and(p.proname='fence' AND p.prokind='f' AND NOT p.proretset AND p.pronargs=3 AND p.pronargdefaults=0 AND p.proargnames=ARRAY['epoch','manifest_h','observed_ms'] AND p.proallargtypes IS NULL AND p.proargmodes IS NULL AND p.proowner='subtrack_auth_executor'::pg_catalog.regrole AND p.prorettype='pg_catalog.bool'::pg_catalog.regtype AND p.proargtypes=ARRAY[25::pg_catalog.oid,'subtrack_auth.h'::pg_catalog.regtype::pg_catalog.oid,'subtrack_auth.ms'::pg_catalog.regtype::pg_catalog.oid]::pg_catalog.oidvector AND p.prosecdef AND NOT p.proisstrict AND p.provolatile='v' AND p.proparallel='u' AND p.proconfig=ARRAY['search_path=pg_catalog'] AND p.prolang=(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql') AND pg_catalog.md5(p.prosrc)='11eaa2b071336af5aa173230c93f003b') FROM pg_catalog.pg_proc p WHERE p.pronamespace='subtrack_auth'::pg_catalog.regnamespace AND p.proname='fence')
  AND (SELECT count(*)=4 AND bool_and(NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls AND NOT rolinherit AND rolcanlogin=(rolname='subtrack_dev_auth_login')) FROM pg_catalog.pg_roles WHERE rolname IN ('subtrack_auth_owner','subtrack_auth_executor','subtrack_auth_producer','subtrack_dev_auth_login'))
  AND (SELECT count(*)=3 AND bool_and(NOT admin_option AND NOT inherit_option AND set_option AND roleid IN ('subtrack_runtime'::pg_catalog.regrole,'subtrack_identity_provisioner'::pg_catalog.regrole,'subtrack_auth_producer'::pg_catalog.regrole)) FROM pg_catalog.pg_auth_members WHERE member='subtrack_dev_auth_login'::pg_catalog.regrole)
  AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members WHERE member IN ('subtrack_auth_owner'::pg_catalog.regrole,'subtrack_auth_executor'::pg_catalog.regrole,'subtrack_auth_producer'::pg_catalog.regrole,'subtrack_runtime'::pg_catalog.regrole,'subtrack_identity_provisioner'::pg_catalog.regrole))
  AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members WHERE roleid IN ('subtrack_auth_owner'::pg_catalog.regrole,'subtrack_auth_executor'::pg_catalog.regrole))
  AND (SELECT count(*)=3 AND bool_and(relname IN ('epoch','reservation','nonce') AND relowner='subtrack_auth_owner'::pg_catalog.regrole AND relrowsecurity AND relforcerowsecurity) FROM pg_catalog.pg_class WHERE relnamespace='subtrack_auth'::pg_catalog.regnamespace AND relkind='r')
  AND (SELECT count(*)=2 AND bool_and(typowner='subtrack_auth_owner'::pg_catalog.regrole AND (typname,typbasetype) IN (('h','pg_catalog.text'::pg_catalog.regtype),('ms','pg_catalog.int8'::pg_catalog.regtype))) FROM pg_catalog.pg_type WHERE typnamespace='subtrack_auth'::pg_catalog.regnamespace AND typtype='d')
  AND (SELECT count(*)=2 AND bool_and(c.contype='c' AND c.convalidated) FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_type t ON t.oid=c.contypid WHERE t.typnamespace='subtrack_auth'::pg_catalog.regnamespace)
  AND (SELECT count(*)=9 AND bool_and(p.polroles=ARRAY['subtrack_auth_executor'::pg_catalog.regrole::pg_catalog.oid] AND p.polpermissive AND (c.relname,p.polname,p.polcmd) IN (('epoch','epoch_select','r'),('epoch','epoch_watermark','w'),('reservation','reservation_select','r'),('reservation','reservation_insert','a'),('reservation','reservation_delete','d'),('reservation','reservation_settle','w'),('nonce','nonce_select','r'),('nonce','nonce_insert','a'),('nonce','nonce_delete','d')) AND CASE WHEN p.polcmd='a' THEN p.polqual IS NULL ELSE pg_catalog.pg_get_expr(p.polqual,p.polrelid)='true' END AND CASE WHEN p.polcmd IN ('a','w') THEN pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid)='true' ELSE p.polwithcheck IS NULL END) FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='subtrack_auth'::pg_catalog.regnamespace)
  AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='subtrack_auth'::pg_catalog.regnamespace AND NOT t.tgisinternal)
  AND (SELECT count(*)=4 AND bool_and(defaclacl=ARRAY[pg_catalog.format('%s=%s/%s',defaclrole::pg_catalog.regrole,CASE WHEN defaclobjtype='f' THEN 'X' ELSE 'U' END,defaclrole::pg_catalog.regrole)::pg_catalog.aclitem]) FROM pg_catalog.pg_default_acl WHERE defaclrole IN ('subtrack_auth_owner'::pg_catalog.regrole,'subtrack_auth_executor'::pg_catalog.regrole) AND defaclnamespace=0 AND defaclobjtype IN ('f','T'))
),false)::pg_catalog.int4;
WITH expected(name,columns,types) AS (VALUES ('epoch',ARRAY['id','manifest_h','origin','watermark_ms','state'],ARRAY['text','subtrack_auth.h','text','subtrack_auth.ms','text']),('reservation',ARRAY['key_h','operation','authority_kind','authority_h','request_h','owner_h','transport','epoch','issued_ms','expires_ms','state'],ARRAY['subtrack_auth.h','text','text','subtrack_auth.h','subtrack_auth.h','subtrack_auth.h','text','text','subtrack_auth.ms','subtrack_auth.ms','text']),('nonce',ARRAY['nonce_h','transport','origin','chain','binding_h','epoch','issued_ms','expires_ms','purpose','authority_h'],ARRAY['subtrack_auth.h','text','text','text','subtrack_auth.h','text','subtrack_auth.ms','subtrack_auth.ms','text','subtrack_auth.h']))
SELECT 1 / (count(*)=3 AND bool_and(e.columns=(SELECT array_agg(a.attname::pg_catalog.text ORDER BY a.attnum) FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0) AND e.types=(SELECT array_agg(pg_catalog.format_type(a.atttypid,a.atttypmod) ORDER BY a.attnum) FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0)))::pg_catalog.int4 FROM expected e JOIN pg_catalog.pg_class c ON c.relname=e.name AND c.relnamespace='subtrack_auth'::pg_catalog.regnamespace;
SELECT 1 / (count(*)=26 AND bool_and(NOT atthasdef AND NOT attisdropped AND (attnotnull OR (attrelid='subtrack_auth.nonce'::pg_catalog.regclass AND attname='authority_h'))))::pg_catalog.int4 FROM pg_catalog.pg_attribute WHERE attrelid IN ('subtrack_auth.epoch'::pg_catalog.regclass,'subtrack_auth.nonce'::pg_catalog.regclass,'subtrack_auth.reservation'::pg_catalog.regclass) AND attnum>0;
-- Compare effective grants, including grant options and grantors, in both directions.
WITH actual AS (
 SELECT 'schema'::pg_catalog.text object,a.* FROM pg_catalog.pg_namespace n, LATERAL pg_catalog.aclexplode(n.nspacl) a WHERE n.nspname='subtrack_auth'
 UNION ALL SELECT t.typname,a.* FROM pg_catalog.pg_type t,LATERAL pg_catalog.aclexplode(t.typacl) a WHERE t.typnamespace='subtrack_auth'::pg_catalog.regnamespace AND t.typtype='d'
 UNION ALL SELECT c.relname,a.* FROM pg_catalog.pg_class c,LATERAL pg_catalog.aclexplode(c.relacl) a WHERE c.relnamespace='subtrack_auth'::pg_catalog.regnamespace AND c.relkind='r'
 UNION ALL SELECT c.relname||'.'||x.attname,a.* FROM pg_catalog.pg_attribute x JOIN pg_catalog.pg_class c ON c.oid=x.attrelid,LATERAL pg_catalog.aclexplode(x.attacl) a WHERE c.relnamespace='subtrack_auth'::pg_catalog.regnamespace
), expected AS (
 SELECT o.object,'subtrack_auth_owner'::pg_catalog.regrole::pg_catalog.oid grantor,r.role::pg_catalog.regrole::pg_catalog.oid grantee,p.privilege_type,false is_grantable
 FROM (VALUES ('schema'),('h'),('ms')) o(object) CROSS JOIN (VALUES ('subtrack_auth_owner'),('subtrack_runtime'),('subtrack_auth_producer'),('subtrack_auth_executor')) r(role)
 CROSS JOIN (VALUES ('USAGE')) p(privilege_type)
 UNION ALL SELECT 'schema','subtrack_auth_owner'::pg_catalog.regrole,'subtrack_auth_owner'::pg_catalog.regrole,'CREATE',false
 UNION ALL SELECT o.object,'subtrack_auth_owner'::pg_catalog.regrole,'subtrack_auth_owner'::pg_catalog.regrole,p.privilege_type,false FROM (VALUES ('epoch'),('nonce'),('reservation')) o(object) CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(privilege_type)
 UNION ALL SELECT o.object,'subtrack_auth_owner'::pg_catalog.regrole,'subtrack_auth_executor'::pg_catalog.regrole,'SELECT',false FROM (VALUES ('epoch'),('nonce'),('reservation')) o(object)
 UNION ALL SELECT o.object,'subtrack_auth_owner'::pg_catalog.regrole,'subtrack_auth_executor'::pg_catalog.regrole,p.privilege_type,false FROM (VALUES ('nonce'),('reservation')) o(object) CROSS JOIN (VALUES ('INSERT'),('DELETE')) p(privilege_type)
 UNION ALL SELECT o.object,'subtrack_auth_owner'::pg_catalog.regrole,'subtrack_auth_executor'::pg_catalog.regrole,'UPDATE',false FROM (VALUES ('epoch.watermark_ms'),('reservation.state')) o(object)
), delta AS ((SELECT * FROM actual EXCEPT SELECT * FROM expected) UNION ALL (SELECT * FROM expected EXCEPT SELECT * FROM actual))
SELECT 1 / (NOT EXISTS (SELECT 1 FROM delta))::pg_catalog.int4;
-- Trusted fixture captures this fingerprint immediately after pinned 001, before any function.
SELECT 1 / (pg_catalog.md5((SELECT pg_catalog.string_agg(pg_catalog.format('%s:%s:%s:%s:%s',c.conname,c.contype,c.convalidated,c.condeferrable,pg_catalog.pg_get_constraintdef(c.oid)),E'\n' ORDER BY c.conname,c.oid) FROM pg_catalog.pg_constraint c WHERE c.connamespace='subtrack_auth'::pg_catalog.regnamespace))=pg_catalog.current_setting('st233c.constraints'))::pg_catalog.int4;
WITH actual AS (SELECT a.* FROM pg_catalog.pg_proc p,LATERAL pg_catalog.aclexplode(p.proacl) a WHERE p.oid='subtrack_auth.fence(text,subtrack_auth.h,subtrack_auth.ms)'::pg_catalog.regprocedure), expected AS (SELECT 'subtrack_auth_executor'::pg_catalog.regrole::pg_catalog.oid grantor,r.role::pg_catalog.regrole::pg_catalog.oid grantee,'EXECUTE'::pg_catalog.text privilege_type,false is_grantable FROM (VALUES ('subtrack_auth_executor'),('subtrack_runtime'),('subtrack_auth_producer')) r(role)), delta AS ((SELECT * FROM actual EXCEPT SELECT * FROM expected) UNION ALL (SELECT * FROM expected EXCEPT SELECT * FROM actual)) SELECT 1/(NOT EXISTS(SELECT 1 FROM delta))::pg_catalog.int4;
SELECT 1 / COALESCE((SELECT count(*)=2 AND bool_and(proname IN ('fence','peek')) FROM pg_catalog.pg_proc WHERE pronamespace='subtrack_auth'::pg_catalog.regnamespace),false)::pg_catalog.int4;
SELECT 1 / COALESCE((SELECT p.prokind='f' AND NOT p.proretset AND p.pronargs=7 AND p.pronargdefaults=0 AND p.proargnames=ARRAY['nonce_h','binding_h','origin','epoch','manifest_h','observed_ms','purpose'] AND p.proallargtypes IS NULL AND p.proargmodes IS NULL AND p.proowner='subtrack_auth_executor'::pg_catalog.regrole AND p.prorettype='pg_catalog.text'::pg_catalog.regtype AND p.prosecdef AND NOT p.proisstrict AND p.provolatile='v' AND p.proparallel='u' AND p.proconfig=ARRAY['search_path=pg_catalog'] AND p.prolang=(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql') AND pg_catalog.md5(p.prosrc)='c6fe8b162102e3a4c4e013b5cfb72f4e' FROM pg_catalog.pg_proc p WHERE p.oid='subtrack_auth.peek(subtrack_auth.h,subtrack_auth.h,text,text,subtrack_auth.h,subtrack_auth.ms,text)'::pg_catalog.regprocedure),false)::pg_catalog.int4;
WITH actual AS (SELECT a.* FROM pg_catalog.pg_proc p,LATERAL pg_catalog.aclexplode(p.proacl) a WHERE p.oid='subtrack_auth.peek(subtrack_auth.h,subtrack_auth.h,text,text,subtrack_auth.h,subtrack_auth.ms,text)'::pg_catalog.regprocedure), expected AS (SELECT 'subtrack_auth_executor'::pg_catalog.regrole::pg_catalog.oid grantor,r.role::pg_catalog.regrole::pg_catalog.oid grantee,'EXECUTE'::pg_catalog.text privilege_type,false is_grantable FROM (VALUES ('subtrack_auth_executor'),('subtrack_runtime'),('subtrack_auth_producer')) r(role)), delta AS ((SELECT * FROM actual EXCEPT SELECT * FROM expected) UNION ALL (SELECT * FROM expected EXCEPT SELECT * FROM actual)) SELECT 1/(NOT EXISTS(SELECT 1 FROM delta))::pg_catalog.int4;
CREATE FUNCTION subtrack_auth.reserve_bootstrap(key_h subtrack_auth.h,owner_h subtrack_auth.h,authority_h subtrack_auth.h,request_h subtrack_auth.h,retention_ms subtrack_auth.ms,origin pg_catalog.text,epoch pg_catalog.text,manifest_h subtrack_auth.h,observed_ms subtrack_auth.ms)
RETURNS pg_catalog.int8 LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
CALLED ON NULL INPUT SET search_path=pg_catalog AS $reserve$
DECLARE
  stored_manifest subtrack_auth.h;
  stored_watermark subtrack_auth.ms;
  stored_state pg_catalog.text;
  stored_origin pg_catalog.text;
  clock_ms pg_catalog.numeric;
  expiry_ms pg_catalog.numeric;
  retained_count pg_catalog.int8;
  admitted_expiry pg_catalog.int8;
BEGIN
  -- A different isolation snapshot cannot safely implement fresh capacity after a wait.
  IF pg_catalog.current_setting('transaction_isolation') OPERATOR(pg_catalog.<>) 'read committed' THEN RETURN NULL; END IF;
  IF key_h IS NULL OR owner_h IS NULL OR authority_h IS NULL OR request_h IS NULL OR retention_ms IS NULL OR origin IS NULL OR epoch IS NULL OR manifest_h IS NULL OR observed_ms IS NULL
    OR epoch OPERATOR(pg_catalog.=) '' OR origin OPERATOR(pg_catalog.<>) (CASE pg_catalog.current_database() WHEN 'st233a_development_auth_foundation_proof' THEN 'https://st233a.invalid' WHEN 'st237_private_https_profile' THEN 'https://localhost:3443' ELSE NULL END)
    OR retention_ms OPERATOR(pg_catalog.<) 1 OR retention_ms OPERATOR(pg_catalog.>) 86400000 THEN RETURN NULL; END IF;
  SELECT e.manifest_h,e.watermark_ms,e.state,e.origin INTO stored_manifest,stored_watermark,stored_state,stored_origin
    FROM subtrack_auth.epoch AS e WHERE e.id OPERATOR(pg_catalog.=) reserve_bootstrap.epoch FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- Fixed private namespace: future reservation/prune writers must use this lock order.
  PERFORM pg_catalog.pg_advisory_xact_lock(233::pg_catalog.int4,4::pg_catalog.int4);
  clock_ms := pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp()) OPERATOR(pg_catalog.*) 1000::pg_catalog.numeric);
  expiry_ms := clock_ms OPERATOR(pg_catalog.+) retention_ms::pg_catalog.numeric;
  IF clock_ms OPERATOR(pg_catalog.<) 0::pg_catalog.numeric OR clock_ms OPERATOR(pg_catalog.>) 9007199254740991::pg_catalog.numeric OR expiry_ms OPERATOR(pg_catalog.>) 9007199254740991::pg_catalog.numeric
    OR stored_state OPERATOR(pg_catalog.<>) 'active' OR stored_manifest OPERATOR(pg_catalog.<>) manifest_h OR stored_origin OPERATOR(pg_catalog.<>) origin
    OR clock_ms OPERATOR(pg_catalog.<) stored_watermark::pg_catalog.numeric OR observed_ms::pg_catalog.numeric OPERATOR(pg_catalog.>) clock_ms THEN RETURN NULL; END IF;
  -- Separate VOLATILE SQL statement: fresh READ COMMITTED snapshot after both locks.
  SELECT pg_catalog.count(*) INTO retained_count FROM subtrack_auth.reservation;
  IF retained_count OPERATOR(pg_catalog.>=) 10000 THEN RETURN NULL; END IF;
  INSERT INTO subtrack_auth.reservation(key_h,operation,authority_kind,authority_h,request_h,owner_h,transport,epoch,issued_ms,expires_ms,state)
    VALUES (reserve_bootstrap.key_h,'createV2BrowserNonce','browser-bootstrap-origin',reserve_bootstrap.authority_h,reserve_bootstrap.request_h,reserve_bootstrap.owner_h,'web',reserve_bootstrap.epoch,clock_ms::pg_catalog.int8::subtrack_auth.ms,expiry_ms::pg_catalog.int8::subtrack_auth.ms,'pending')
    ON CONFLICT DO NOTHING RETURNING expires_ms::pg_catalog.int8 INTO admitted_expiry;
  RETURN admitted_expiry;
END
$reserve$;
ALTER FUNCTION subtrack_auth.reserve_bootstrap(subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,subtrack_auth.ms,pg_catalog.text,pg_catalog.text,subtrack_auth.h,subtrack_auth.ms) OWNER TO subtrack_auth_executor;
REVOKE ALL ON FUNCTION subtrack_auth.reserve_bootstrap(subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,subtrack_auth.ms,pg_catalog.text,pg_catalog.text,subtrack_auth.h,subtrack_auth.ms) FROM PUBLIC,st233a_fixture_owner;
GRANT EXECUTE ON FUNCTION subtrack_auth.reserve_bootstrap(subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,subtrack_auth.ms,pg_catalog.text,pg_catalog.text,subtrack_auth.h,subtrack_auth.ms) TO subtrack_runtime;
COMMIT;
