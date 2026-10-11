-- ST-235: disposable PG16 current-web authority. Install only after pinned 001-008.
BEGIN;
SET LOCAL search_path = pg_catalog;
SELECT 1 / COALESCE((pg_catalog.current_database() IN ('st233a_development_auth_foundation_proof','st237_private_https_profile')
  AND SESSION_USER = 'st233a_fixture_owner'
  AND pg_catalog.current_setting('server_version_num')::pg_catalog.int4 BETWEEN 160000 AND 169999
  AND EXISTS (SELECT 1 FROM public.st233a_fixture_control AS c WHERE c.task = 'ST-233a'
    AND c.head = pg_catalog.current_setting('st233a.head') AND c.marker = pg_catalog.current_setting('st233a.marker')
    AND c.marker ~ '^[a-f0-9]{32}$')
  AND (SELECT n.nspowner = 'subtrack_auth_owner'::pg_catalog.regrole FROM pg_catalog.pg_namespace AS n WHERE n.nspname = 'subtrack_auth')
  AND (SELECT pg_catalog.count(*) = 4 AND pg_catalog.bool_and(NOT r.rolsuper AND NOT r.rolcreatedb
    AND NOT r.rolcreaterole AND NOT r.rolbypassrls AND NOT r.rolinherit
    AND r.rolcanlogin = (r.rolname = 'subtrack_dev_auth_login')) FROM pg_catalog.pg_roles AS r
    WHERE r.rolname IN ('subtrack_auth_owner','subtrack_auth_executor','subtrack_auth_producer','subtrack_dev_auth_login'))
  AND (SELECT pg_catalog.count(*) = 3 AND pg_catalog.bool_and(NOT m.admin_option AND NOT m.inherit_option
    AND m.set_option AND m.roleid IN ('subtrack_runtime'::pg_catalog.regrole,'subtrack_identity_provisioner'::pg_catalog.regrole,'subtrack_auth_producer'::pg_catalog.regrole))
    FROM pg_catalog.pg_auth_members AS m WHERE m.member = 'subtrack_dev_auth_login'::pg_catalog.regrole)
  AND (SELECT pg_catalog.count(*) = 3 AND pg_catalog.bool_and(c.relname IN ('epoch','reservation','nonce')
    AND c.relowner = 'subtrack_auth_owner'::pg_catalog.regrole AND c.relrowsecurity AND c.relforcerowsecurity)
    FROM pg_catalog.pg_class AS c WHERE c.relnamespace = 'subtrack_auth'::pg_catalog.regnamespace AND c.relkind = 'r')
  AND (SELECT pg_catalog.count(*) = 9 AND pg_catalog.bool_and(p.polroles = ARRAY['subtrack_auth_executor'::pg_catalog.regrole::pg_catalog.oid]
    AND (c.relname,p.polname,p.polcmd) IN (('epoch','epoch_select','r'),('epoch','epoch_watermark','w'),
    ('reservation','reservation_select','r'),('reservation','reservation_insert','a'),('reservation','reservation_delete','d'),
    ('reservation','reservation_settle','w'),('nonce','nonce_select','r'),('nonce','nonce_insert','a'),('nonce','nonce_delete','d')))
    FROM pg_catalog.pg_policy AS p JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
    WHERE c.relnamespace = 'subtrack_auth'::pg_catalog.regnamespace)
  AND (SELECT pg_catalog.count(*) = 7 AND pg_catalog.bool_and(p.proname IN ('fence','peek','reserve_bootstrap',
    'prune_reservations','settle_bootstrap','prune_nonces','issue_bootstrap_nonce')
    AND p.proowner = 'subtrack_auth_executor'::pg_catalog.regrole AND p.prosecdef AND p.provolatile = 'v'
    AND p.proparallel = 'u' AND p.proconfig = ARRAY['search_path=pg_catalog'])
    FROM pg_catalog.pg_proc AS p WHERE p.pronamespace = 'subtrack_auth'::pg_catalog.regnamespace)
  AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid
    WHERE c.relnamespace = 'subtrack_auth'::pg_catalog.regnamespace AND NOT t.tgisinternal)
  AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members AS m WHERE m.member = 'subtrack_dev_auth_login'::pg_catalog.regrole
    AND m.roleid IN ('subtrack_auth_owner'::pg_catalog.regrole,'subtrack_auth_executor'::pg_catalog.regrole))
),false)::pg_catalog.int4;

SET LOCAL ROLE subtrack_auth_owner;
CREATE TABLE subtrack_auth.family (
  family_id pg_catalog.uuid PRIMARY KEY,
  identity_id pg_catalog.uuid NOT NULL,
  epoch pg_catalog.text NOT NULL REFERENCES subtrack_auth.epoch(id),
  issued_ms subtrack_auth.ms NOT NULL,
  expires_ms subtrack_auth.ms NOT NULL,
  revoked_ms subtrack_auth.ms,
  UNIQUE (family_id,identity_id,epoch),
  CHECK (expires_ms > issued_ms AND expires_ms - issued_ms <= 86400000),
  CHECK (revoked_ms IS NULL OR revoked_ms >= issued_ms)
);
CREATE TABLE subtrack_auth.session (
  session_id pg_catalog.uuid PRIMARY KEY,
  family_id pg_catalog.uuid NOT NULL,
  identity_id pg_catalog.uuid NOT NULL,
  transport pg_catalog.text NOT NULL CHECK (transport = 'web'),
  origin pg_catalog.text NOT NULL CHECK (origin = (CASE pg_catalog.current_database() WHEN 'st233a_development_auth_foundation_proof' THEN 'https://st233a.invalid' WHEN 'st237_private_https_profile' THEN 'https://localhost:3443' ELSE NULL END)),
  chain pg_catalog.text NOT NULL CHECK (chain <> ''),
  binding_h subtrack_auth.h NOT NULL,
  epoch pg_catalog.text NOT NULL,
  issued_ms subtrack_auth.ms NOT NULL,
  expires_ms subtrack_auth.ms NOT NULL,
  revoked_ms subtrack_auth.ms,
  UNIQUE (session_id,family_id,identity_id,epoch),
  FOREIGN KEY (family_id,identity_id,epoch) REFERENCES subtrack_auth.family(family_id,identity_id,epoch),
  FOREIGN KEY (epoch,origin) REFERENCES subtrack_auth.epoch(id,origin),
  CHECK (expires_ms > issued_ms AND expires_ms - issued_ms <= 86400000),
  CHECK (revoked_ms IS NULL OR revoked_ms >= issued_ms)
);
CREATE TABLE subtrack_auth.credential (
  refresh_h subtrack_auth.h PRIMARY KEY,
  session_id pg_catalog.uuid NOT NULL,
  family_id pg_catalog.uuid NOT NULL,
  identity_id pg_catalog.uuid NOT NULL,
  epoch pg_catalog.text NOT NULL,
  state pg_catalog.text NOT NULL CHECK (state = 'current'),
  issued_ms subtrack_auth.ms NOT NULL,
  expires_ms subtrack_auth.ms NOT NULL,
  FOREIGN KEY (session_id,family_id,identity_id,epoch) REFERENCES subtrack_auth.session(session_id,family_id,identity_id,epoch),
  UNIQUE (session_id),
  CHECK (expires_ms > issued_ms AND expires_ms - issued_ms <= 86400000)
);
CREATE TABLE subtrack_auth.csrf (
  session_id pg_catalog.uuid PRIMARY KEY,
  family_id pg_catalog.uuid NOT NULL,
  identity_id pg_catalog.uuid NOT NULL,
  epoch pg_catalog.text NOT NULL,
  token_h subtrack_auth.h NOT NULL,
  issued_ms subtrack_auth.ms NOT NULL,
  expires_ms subtrack_auth.ms NOT NULL,
  FOREIGN KEY (session_id,family_id,identity_id,epoch) REFERENCES subtrack_auth.session(session_id,family_id,identity_id,epoch),
  CHECK (expires_ms > issued_ms AND expires_ms - issued_ms <= 86400000)
);
ALTER TABLE subtrack_auth.family ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtrack_auth.family FORCE ROW LEVEL SECURITY;
ALTER TABLE subtrack_auth.session ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtrack_auth.session FORCE ROW LEVEL SECURITY;
ALTER TABLE subtrack_auth.credential ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtrack_auth.credential FORCE ROW LEVEL SECURITY;
ALTER TABLE subtrack_auth.csrf ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtrack_auth.csrf FORCE ROW LEVEL SECURITY;
CREATE POLICY family_select ON subtrack_auth.family FOR SELECT TO subtrack_auth_executor USING (true);
CREATE POLICY family_insert ON subtrack_auth.family FOR INSERT TO subtrack_auth_executor WITH CHECK (true);
CREATE POLICY family_update ON subtrack_auth.family FOR UPDATE TO subtrack_auth_executor USING (true) WITH CHECK (true);
CREATE POLICY session_select ON subtrack_auth.session FOR SELECT TO subtrack_auth_executor USING (true);
CREATE POLICY session_insert ON subtrack_auth.session FOR INSERT TO subtrack_auth_executor WITH CHECK (true);
CREATE POLICY session_update ON subtrack_auth.session FOR UPDATE TO subtrack_auth_executor USING (true) WITH CHECK (true);
CREATE POLICY credential_select ON subtrack_auth.credential FOR SELECT TO subtrack_auth_executor USING (true);
CREATE POLICY credential_insert ON subtrack_auth.credential FOR INSERT TO subtrack_auth_executor WITH CHECK (true);
CREATE POLICY csrf_select ON subtrack_auth.csrf FOR SELECT TO subtrack_auth_executor USING (true);
CREATE POLICY csrf_insert ON subtrack_auth.csrf FOR INSERT TO subtrack_auth_executor WITH CHECK (true);
CREATE POLICY csrf_update ON subtrack_auth.csrf FOR UPDATE TO subtrack_auth_executor USING (true) WITH CHECK (true);
CREATE POLICY csrf_delete ON subtrack_auth.csrf FOR DELETE TO subtrack_auth_executor USING (true);
REVOKE ALL ON subtrack_auth.family,subtrack_auth.session,subtrack_auth.credential,subtrack_auth.csrf FROM PUBLIC;
GRANT SELECT,INSERT ON subtrack_auth.family,subtrack_auth.session,subtrack_auth.credential,subtrack_auth.csrf TO subtrack_auth_executor;
GRANT UPDATE(revoked_ms) ON subtrack_auth.family,subtrack_auth.session TO subtrack_auth_executor;
GRANT UPDATE(token_h,issued_ms,expires_ms) ON subtrack_auth.csrf TO subtrack_auth_executor;
GRANT DELETE ON subtrack_auth.csrf TO subtrack_auth_executor;
RESET ROLE;

-- The proof fixture owns the synthetic identity and a locally verified session nonce.
-- No login/runtime role can execute this arbitrary-UUID issuance function.
CREATE FUNCTION subtrack_auth.issue_fixture(owner_id pg_catalog.uuid,sid pg_catalog.uuid,fid pg_catalog.uuid,
  refresh_h subtrack_auth.h,csrf_h subtrack_auth.h,nonce_h subtrack_auth.h,binding_h subtrack_auth.h,
  origin pg_catalog.text,chain pg_catalog.text,epoch pg_catalog.text,manifest_h subtrack_auth.h,observed_ms subtrack_auth.ms)
RETURNS pg_catalog.bool LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
CALLED ON NULL INPUT SET search_path=pg_catalog AS $issue_fixture$
DECLARE
  e subtrack_auth.epoch%ROWTYPE;
  n subtrack_auth.nonce%ROWTYPE;
  now_ms pg_catalog.numeric;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') OPERATOR(pg_catalog.<>) 'read committed'
    OR owner_id IS NULL OR sid IS NULL OR fid IS NULL OR refresh_h IS NULL OR csrf_h IS NULL
    OR nonce_h IS NULL OR binding_h IS NULL OR origin IS NULL OR chain IS NULL OR chain OPERATOR(pg_catalog.=) ''
    OR epoch IS NULL OR manifest_h IS NULL OR observed_ms IS NULL THEN RETURN false; END IF;
  SELECT x.* INTO e FROM subtrack_auth.epoch AS x WHERE x.id OPERATOR(pg_catalog.=) issue_fixture.epoch FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT x.* INTO n FROM subtrack_auth.nonce AS x WHERE x.nonce_h OPERATOR(pg_catalog.=) issue_fixture.nonce_h;
  IF NOT FOUND THEN RETURN false; END IF;
  now_ms := pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp()) OPERATOR(pg_catalog.*) 1000::pg_catalog.numeric);
  IF now_ms OPERATOR(pg_catalog.<) 0 OR now_ms OPERATOR(pg_catalog.>) 9007199168340991
    OR e.state OPERATOR(pg_catalog.<>) 'active' OR e.manifest_h OPERATOR(pg_catalog.<>) manifest_h
    OR e.origin OPERATOR(pg_catalog.<>) origin OR now_ms OPERATOR(pg_catalog.<) e.watermark_ms::pg_catalog.numeric
    OR observed_ms::pg_catalog.numeric OPERATOR(pg_catalog.>) now_ms
    OR n.purpose OPERATOR(pg_catalog.<>) 'session' OR n.transport OPERATOR(pg_catalog.<>) 'web'
    OR n.origin OPERATOR(pg_catalog.<>) origin OR n.chain OPERATOR(pg_catalog.<>) chain
    OR n.binding_h OPERATOR(pg_catalog.<>) binding_h OR n.epoch OPERATOR(pg_catalog.<>) epoch
    OR n.authority_h IS NOT NULL OR n.issued_ms::pg_catalog.numeric OPERATOR(pg_catalog.>) now_ms
    OR now_ms OPERATOR(pg_catalog.>=) n.expires_ms::pg_catalog.numeric THEN RETURN false; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(235::pg_catalog.int4,1::pg_catalog.int4);
  IF (SELECT pg_catalog.count(*) FROM subtrack_auth.session) OPERATOR(pg_catalog.>=) 10000 THEN RETURN false; END IF;
  -- DELETE is the only existing executor lifecycle grant on nonce. It locks the
  -- exact nonce and is rolled back on any post-wait failed predicate.
  DELETE FROM subtrack_auth.nonce AS x WHERE x.nonce_h OPERATOR(pg_catalog.=) issue_fixture.nonce_h
    AND x.purpose OPERATOR(pg_catalog.=) 'session' AND x.origin OPERATOR(pg_catalog.=) issue_fixture.origin
    AND x.chain OPERATOR(pg_catalog.=) issue_fixture.chain AND x.binding_h OPERATOR(pg_catalog.=) issue_fixture.binding_h
    AND x.epoch OPERATOR(pg_catalog.=) issue_fixture.epoch RETURNING x.* INTO n;
  IF NOT FOUND THEN RETURN false; END IF;
  now_ms := pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp()) OPERATOR(pg_catalog.*) 1000::pg_catalog.numeric);
  IF now_ms OPERATOR(pg_catalog.>) 9007199168340991
    OR n.issued_ms::pg_catalog.numeric OPERATOR(pg_catalog.>) now_ms
    OR now_ms OPERATOR(pg_catalog.>=) n.expires_ms::pg_catalog.numeric THEN
    RAISE EXCEPTION USING ERRCODE='22012',MESSAGE='fixture issue refused';
  END IF;
  INSERT INTO subtrack_auth.family VALUES (fid,owner_id,epoch,now_ms::pg_catalog.int8::subtrack_auth.ms,
    (now_ms OPERATOR(pg_catalog.+) 86400000)::pg_catalog.int8::subtrack_auth.ms,NULL);
  INSERT INTO subtrack_auth.session VALUES (sid,fid,owner_id,'web',origin,chain,binding_h,epoch,
    now_ms::pg_catalog.int8::subtrack_auth.ms,(now_ms OPERATOR(pg_catalog.+) 86400000)::pg_catalog.int8::subtrack_auth.ms,NULL);
  INSERT INTO subtrack_auth.credential VALUES (refresh_h,sid,fid,owner_id,epoch,'current',
    now_ms::pg_catalog.int8::subtrack_auth.ms,(now_ms OPERATOR(pg_catalog.+) 86400000)::pg_catalog.int8::subtrack_auth.ms);
  INSERT INTO subtrack_auth.csrf VALUES (sid,fid,owner_id,epoch,csrf_h,
    now_ms::pg_catalog.int8::subtrack_auth.ms,(now_ms OPERATOR(pg_catalog.+) 86400000)::pg_catalog.int8::subtrack_auth.ms);
  RETURN true;
END
$issue_fixture$;
ALTER FUNCTION subtrack_auth.issue_fixture(pg_catalog.uuid,pg_catalog.uuid,pg_catalog.uuid,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,pg_catalog.text,pg_catalog.text,pg_catalog.text,subtrack_auth.h,subtrack_auth.ms) OWNER TO subtrack_auth_executor;
REVOKE ALL ON FUNCTION subtrack_auth.issue_fixture(pg_catalog.uuid,pg_catalog.uuid,pg_catalog.uuid,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,pg_catalog.text,pg_catalog.text,pg_catalog.text,subtrack_auth.h,subtrack_auth.ms) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION subtrack_auth.issue_fixture(pg_catalog.uuid,pg_catalog.uuid,pg_catalog.uuid,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,pg_catalog.text,pg_catalog.text,pg_catalog.text,subtrack_auth.h,subtrack_auth.ms) TO st233a_fixture_owner;

CREATE FUNCTION subtrack_auth.check_current_web(sub pg_catalog.uuid,sid pg_catalog.uuid,origin pg_catalog.text,
  chain pg_catalog.text,binding_h subtrack_auth.h,csrf_h subtrack_auth.h,epoch pg_catalog.text,
  manifest_h subtrack_auth.h,observed_ms subtrack_auth.ms)
RETURNS pg_catalog.bool LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
CALLED ON NULL INPUT SET search_path=pg_catalog AS $check_current_web$
DECLARE
  e subtrack_auth.epoch%ROWTYPE;
  f subtrack_auth.family%ROWTYPE;
  s subtrack_auth.session%ROWTYPE;
  c subtrack_auth.credential%ROWTYPE;
  x subtrack_auth.csrf%ROWTYPE;
  now_ms pg_catalog.numeric;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') OPERATOR(pg_catalog.<>) 'read committed'
    OR sub IS NULL OR sid IS NULL OR origin IS NULL OR chain IS NULL OR chain OPERATOR(pg_catalog.=) ''
    OR binding_h IS NULL OR csrf_h IS NULL OR epoch IS NULL OR manifest_h IS NULL OR observed_ms IS NULL
    OR origin OPERATOR(pg_catalog.<>) (CASE pg_catalog.current_database() WHEN 'st233a_development_auth_foundation_proof' THEN 'https://st233a.invalid' WHEN 'st237_private_https_profile' THEN 'https://localhost:3443' ELSE NULL END)
    OR pg_catalog.current_setting('app.user_id',true) IS DISTINCT FROM sub::pg_catalog.text
    OR pg_catalog.current_setting('app.current_user_id',true) IS DISTINCT FROM sub::pg_catalog.text THEN RETURN false; END IF;
  SELECT t.* INTO e FROM subtrack_auth.epoch AS t WHERE t.id OPERATOR(pg_catalog.=) check_current_web.epoch;
  IF NOT FOUND THEN RETURN false; END IF;
  -- Caller holds the live public.identity lock; private locks follow family, session, credential, csrf.
  SELECT t.* INTO f FROM subtrack_auth.family AS t WHERE t.family_id OPERATOR(pg_catalog.=)
    (SELECT q.family_id FROM subtrack_auth.session AS q WHERE q.session_id OPERATOR(pg_catalog.=) check_current_web.sid
      AND q.identity_id OPERATOR(pg_catalog.=) check_current_web.sub) FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT t.* INTO s FROM subtrack_auth.session AS t WHERE t.session_id OPERATOR(pg_catalog.=) check_current_web.sid FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  -- Credential is immutable in this slice (executor has SELECT/INSERT only). The
  -- session row lock serializes its creation; this transaction lock pins the
  -- credential witness without widening credential UPDATE privileges.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(check_current_web.sid::pg_catalog.text,235::pg_catalog.int8));
  SELECT t.* INTO c FROM subtrack_auth.credential AS t WHERE t.session_id OPERATOR(pg_catalog.=) check_current_web.sid
    AND t.state OPERATOR(pg_catalog.=) 'current';
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT t.* INTO x FROM subtrack_auth.csrf AS t WHERE t.session_id OPERATOR(pg_catalog.=) check_current_web.sid FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  now_ms := pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp()) OPERATOR(pg_catalog.*) 1000::pg_catalog.numeric);
  RETURN now_ms OPERATOR(pg_catalog.>=) 0 AND now_ms OPERATOR(pg_catalog.<=) 9007199254740991
    AND e.state OPERATOR(pg_catalog.=) 'active' AND e.manifest_h OPERATOR(pg_catalog.=) manifest_h
    AND e.origin OPERATOR(pg_catalog.=) origin AND now_ms OPERATOR(pg_catalog.>=) e.watermark_ms::pg_catalog.numeric
    AND observed_ms::pg_catalog.numeric OPERATOR(pg_catalog.<=) now_ms
    AND f.family_id OPERATOR(pg_catalog.=) s.family_id AND f.identity_id OPERATOR(pg_catalog.=) sub
    AND f.epoch OPERATOR(pg_catalog.=) epoch AND f.revoked_ms IS NULL
    AND f.issued_ms::pg_catalog.numeric OPERATOR(pg_catalog.<=) now_ms AND now_ms OPERATOR(pg_catalog.<) f.expires_ms::pg_catalog.numeric
    AND s.identity_id OPERATOR(pg_catalog.=) sub AND s.epoch OPERATOR(pg_catalog.=) epoch
    AND s.transport OPERATOR(pg_catalog.=) 'web' AND s.origin OPERATOR(pg_catalog.=) origin
    AND s.chain OPERATOR(pg_catalog.=) chain AND s.binding_h OPERATOR(pg_catalog.=) binding_h
    AND s.revoked_ms IS NULL AND s.issued_ms::pg_catalog.numeric OPERATOR(pg_catalog.<=) now_ms
    AND now_ms OPERATOR(pg_catalog.<) s.expires_ms::pg_catalog.numeric
    AND c.identity_id OPERATOR(pg_catalog.=) sub AND c.family_id OPERATOR(pg_catalog.=) f.family_id
    AND c.epoch OPERATOR(pg_catalog.=) epoch AND c.issued_ms::pg_catalog.numeric OPERATOR(pg_catalog.<=) now_ms
    AND now_ms OPERATOR(pg_catalog.<) c.expires_ms::pg_catalog.numeric
    AND x.identity_id OPERATOR(pg_catalog.=) sub AND x.family_id OPERATOR(pg_catalog.=) f.family_id
    AND x.epoch OPERATOR(pg_catalog.=) epoch AND x.token_h OPERATOR(pg_catalog.=) csrf_h
    AND x.issued_ms::pg_catalog.numeric OPERATOR(pg_catalog.<=) now_ms
    AND now_ms OPERATOR(pg_catalog.<) x.expires_ms::pg_catalog.numeric;
END
$check_current_web$;
ALTER FUNCTION subtrack_auth.check_current_web(pg_catalog.uuid,pg_catalog.uuid,pg_catalog.text,pg_catalog.text,subtrack_auth.h,subtrack_auth.h,pg_catalog.text,subtrack_auth.h,subtrack_auth.ms) OWNER TO subtrack_auth_executor;
REVOKE ALL ON FUNCTION subtrack_auth.check_current_web(pg_catalog.uuid,pg_catalog.uuid,pg_catalog.text,pg_catalog.text,subtrack_auth.h,subtrack_auth.h,pg_catalog.text,subtrack_auth.h,subtrack_auth.ms) FROM PUBLIC,st233a_fixture_owner;
GRANT EXECUTE ON FUNCTION subtrack_auth.check_current_web(pg_catalog.uuid,pg_catalog.uuid,pg_catalog.text,pg_catalog.text,subtrack_auth.h,subtrack_auth.h,pg_catalog.text,subtrack_auth.h,subtrack_auth.ms) TO subtrack_runtime;

CREATE FUNCTION subtrack_auth.replace_current_csrf(sub pg_catalog.uuid,sid pg_catalog.uuid,origin pg_catalog.text,
  chain pg_catalog.text,binding_h subtrack_auth.h,csrf_h subtrack_auth.h,epoch pg_catalog.text,
  manifest_h subtrack_auth.h,observed_ms subtrack_auth.ms,next_csrf_h subtrack_auth.h)
RETURNS pg_catalog.bool LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
CALLED ON NULL INPUT SET search_path=pg_catalog AS $replace_current_csrf$
DECLARE
  now_ms pg_catalog.numeric;
  changed pg_catalog.int4;
BEGIN
  IF next_csrf_h IS NULL OR next_csrf_h OPERATOR(pg_catalog.=) csrf_h OR NOT COALESCE(subtrack_auth.check_current_web(sub,sid,origin,chain,binding_h,csrf_h,epoch,manifest_h,observed_ms),false) THEN RETURN false; END IF;
  now_ms := pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp()) OPERATOR(pg_catalog.*) 1000::pg_catalog.numeric);
  IF now_ms OPERATOR(pg_catalog.>) 9007199254740991 OR now_ms OPERATOR(pg_catalog.>=)
    (SELECT s.expires_ms::pg_catalog.numeric FROM subtrack_auth.session AS s WHERE s.session_id OPERATOR(pg_catalog.=) sid) THEN RETURN false; END IF;
  UPDATE subtrack_auth.csrf AS x SET token_h=next_csrf_h,issued_ms=now_ms::pg_catalog.int8::subtrack_auth.ms
    WHERE x.session_id OPERATOR(pg_catalog.=) sid AND x.identity_id OPERATOR(pg_catalog.=) sub
      AND x.epoch OPERATOR(pg_catalog.=) replace_current_csrf.epoch AND x.token_h OPERATOR(pg_catalog.=) csrf_h;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed OPERATOR(pg_catalog.=) 1;
END
$replace_current_csrf$;
ALTER FUNCTION subtrack_auth.replace_current_csrf(pg_catalog.uuid,pg_catalog.uuid,pg_catalog.text,pg_catalog.text,subtrack_auth.h,subtrack_auth.h,pg_catalog.text,subtrack_auth.h,subtrack_auth.ms,subtrack_auth.h) OWNER TO subtrack_auth_executor;
REVOKE ALL ON FUNCTION subtrack_auth.replace_current_csrf(pg_catalog.uuid,pg_catalog.uuid,pg_catalog.text,pg_catalog.text,subtrack_auth.h,subtrack_auth.h,pg_catalog.text,subtrack_auth.h,subtrack_auth.ms,subtrack_auth.h) FROM PUBLIC,st233a_fixture_owner;
GRANT EXECUTE ON FUNCTION subtrack_auth.replace_current_csrf(pg_catalog.uuid,pg_catalog.uuid,pg_catalog.text,pg_catalog.text,subtrack_auth.h,subtrack_auth.h,pg_catalog.text,subtrack_auth.h,subtrack_auth.ms,subtrack_auth.h) TO subtrack_runtime;

CREATE FUNCTION subtrack_auth.revoke_current(sub pg_catalog.uuid,sid pg_catalog.uuid,origin pg_catalog.text,
  chain pg_catalog.text,binding_h subtrack_auth.h,csrf_h subtrack_auth.h,epoch pg_catalog.text,
  manifest_h subtrack_auth.h,observed_ms subtrack_auth.ms)
RETURNS pg_catalog.bool LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
CALLED ON NULL INPUT SET search_path=pg_catalog AS $revoke_current$
DECLARE
  now_ms subtrack_auth.ms;
  family_key pg_catalog.uuid;
  changed pg_catalog.int4;
BEGIN
  IF NOT COALESCE(subtrack_auth.check_current_web(sub,sid,origin,chain,binding_h,csrf_h,epoch,manifest_h,observed_ms),false) THEN RETURN false; END IF;
  now_ms := pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp()) OPERATOR(pg_catalog.*) 1000::pg_catalog.numeric)::pg_catalog.int8::subtrack_auth.ms;
  SELECT s.family_id INTO family_key FROM subtrack_auth.session AS s WHERE s.session_id OPERATOR(pg_catalog.=) sid;
  UPDATE subtrack_auth.family AS f SET revoked_ms=now_ms WHERE f.family_id OPERATOR(pg_catalog.=) family_key
    AND f.identity_id OPERATOR(pg_catalog.=) sub AND f.epoch OPERATOR(pg_catalog.=) revoke_current.epoch AND f.revoked_ms IS NULL;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed OPERATOR(pg_catalog.<>) 1 THEN RETURN false; END IF;
  UPDATE subtrack_auth.session AS s SET revoked_ms=now_ms WHERE s.session_id OPERATOR(pg_catalog.=) sid
    AND s.identity_id OPERATOR(pg_catalog.=) sub AND s.epoch OPERATOR(pg_catalog.=) revoke_current.epoch AND s.revoked_ms IS NULL;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed OPERATOR(pg_catalog.<>) 1 THEN RAISE EXCEPTION USING ERRCODE='22012',MESSAGE='revoke refused'; END IF;
  DELETE FROM subtrack_auth.csrf AS x WHERE x.session_id OPERATOR(pg_catalog.=) sid AND x.identity_id OPERATOR(pg_catalog.=) sub;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed OPERATOR(pg_catalog.<>) 1 THEN RAISE EXCEPTION USING ERRCODE='22012',MESSAGE='revoke refused'; END IF;
  RETURN true;
END
$revoke_current$;
ALTER FUNCTION subtrack_auth.revoke_current(pg_catalog.uuid,pg_catalog.uuid,pg_catalog.text,pg_catalog.text,subtrack_auth.h,subtrack_auth.h,pg_catalog.text,subtrack_auth.h,subtrack_auth.ms) OWNER TO subtrack_auth_executor;
REVOKE ALL ON FUNCTION subtrack_auth.revoke_current(pg_catalog.uuid,pg_catalog.uuid,pg_catalog.text,pg_catalog.text,subtrack_auth.h,subtrack_auth.h,pg_catalog.text,subtrack_auth.h,subtrack_auth.ms) FROM PUBLIC,st233a_fixture_owner;
GRANT EXECUTE ON FUNCTION subtrack_auth.revoke_current(pg_catalog.uuid,pg_catalog.uuid,pg_catalog.text,pg_catalog.text,subtrack_auth.h,subtrack_auth.h,pg_catalog.text,subtrack_auth.h,subtrack_auth.ms) TO subtrack_runtime;
COMMIT;
