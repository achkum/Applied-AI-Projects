-- ST-239 private returning login. Install only after qualified SQL001-011.
BEGIN;
SET LOCAL search_path = pg_catalog;
SELECT 1 / COALESCE((pg_catalog.current_database() IN
    ('st233a_development_auth_foundation_proof','st237_private_https_profile')
  AND SESSION_USER='st233a_fixture_owner'
  AND pg_catalog.current_setting('server_version_num')::pg_catalog.int4 BETWEEN 160000 AND 169999
  AND EXISTS (SELECT 1 FROM public.st233a_fixture_control c WHERE c.task='ST-233a'
    AND c.head=pg_catalog.current_setting('st233a.head') AND c.marker=pg_catalog.current_setting('st233a.marker')
    AND c.marker ~ '^[a-f0-9]{32}$')
  AND (SELECT nspowner='subtrack_auth_owner'::pg_catalog.regrole FROM pg_catalog.pg_namespace WHERE nspname='subtrack_auth')
  AND (SELECT pg_catalog.count(*)=3 AND pg_catalog.bool_and(NOT admin_option AND NOT inherit_option AND set_option
    AND roleid IN ('subtrack_runtime'::pg_catalog.regrole,'subtrack_identity_provisioner'::pg_catalog.regrole,
      'subtrack_auth_producer'::pg_catalog.regrole)) FROM pg_catalog.pg_auth_members
    WHERE member='subtrack_dev_auth_login'::pg_catalog.regrole)
  AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members WHERE member='subtrack_dev_auth_login'::pg_catalog.regrole
    AND roleid IN ('subtrack_auth_owner'::pg_catalog.regrole,'subtrack_auth_executor'::pg_catalog.regrole))
  AND to_regclass('subtrack_auth.login_proof') IS NULL
  AND to_regtype('subtrack_auth.login_scope') IS NULL
  AND to_regprocedure('subtrack_auth.reserve_enrollment(subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,text,text,text,subtrack_auth.h,subtrack_auth.ms)') IS NOT NULL
  AND to_regprocedure('subtrack_auth.consume_enrollment(subtrack_auth.enrollment_scope,subtrack_auth.h,subtrack_auth.h)') IS NOT NULL
  AND to_regclass('public.identity_profile') IS NOT NULL
),false)::pg_catalog.int4;

-- Executor can lock only the server-derived current owner. The false new-row
-- policy prevents every resulting UPDATE, including an id=id write.
GRANT UPDATE(id) ON public.identity TO subtrack_auth_executor;
CREATE POLICY identity_login_executor_lock ON public.identity FOR UPDATE TO subtrack_auth_executor
  USING (id::pg_catalog.text = pg_catalog.current_setting('app.user_id',true)
    AND id::pg_catalog.text = pg_catalog.current_setting('app.current_user_id',true))
  WITH CHECK (false);

SET LOCAL ROLE subtrack_auth_owner;
CREATE TYPE subtrack_auth.login_scope AS (
  key_h subtrack_auth.h, owner_h subtrack_auth.h, authority_h subtrack_auth.h, request_h subtrack_auth.h,
  nonce_h subtrack_auth.h, binding_h subtrack_auth.h, origin pg_catalog.text, chain pg_catalog.text,
  epoch pg_catalog.text, manifest_h subtrack_auth.h, observed_ms subtrack_auth.ms
);
REVOKE ALL ON TYPE subtrack_auth.login_scope FROM PUBLIC;
GRANT USAGE ON TYPE subtrack_auth.login_scope TO subtrack_runtime,subtrack_auth_producer,subtrack_auth_executor;
CREATE TABLE subtrack_auth.login_proof (
  proof_h subtrack_auth.h PRIMARY KEY,
  identity_id pg_catalog.uuid NOT NULL,
  subject_h subtrack_auth.h NOT NULL,
  terminal_nonce_h subtrack_auth.h NOT NULL UNIQUE REFERENCES subtrack_auth.nonce(nonce_h) ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED,
  origin pg_catalog.text NOT NULL CHECK (origin=(CASE pg_catalog.current_database()
    WHEN 'st233a_development_auth_foundation_proof' THEN 'https://st233a.invalid'
    WHEN 'st237_private_https_profile' THEN 'https://localhost:3443' ELSE NULL END)),
  chain pg_catalog.text NOT NULL CHECK (chain<>''),
  binding_h subtrack_auth.h NOT NULL,
  session_binding_h subtrack_auth.h NOT NULL,
  epoch pg_catalog.text NOT NULL REFERENCES subtrack_auth.epoch(id),
  issued_ms subtrack_auth.ms NOT NULL,
  expires_ms subtrack_auth.ms NOT NULL,
  CHECK (expires_ms>issued_ms AND expires_ms-issued_ms<=300000)
);
ALTER TABLE subtrack_auth.login_proof ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtrack_auth.login_proof FORCE ROW LEVEL SECURITY;
CREATE POLICY login_proof_select ON subtrack_auth.login_proof FOR SELECT TO subtrack_auth_executor USING (true);
CREATE POLICY login_proof_insert ON subtrack_auth.login_proof FOR INSERT TO subtrack_auth_executor WITH CHECK (true);
CREATE POLICY login_proof_delete ON subtrack_auth.login_proof FOR DELETE TO subtrack_auth_executor USING (true);
CREATE POLICY login_proof_update ON subtrack_auth.login_proof FOR UPDATE TO subtrack_auth_executor USING (true) WITH CHECK (false);
REVOKE ALL ON subtrack_auth.login_proof FROM PUBLIC;
GRANT SELECT,INSERT,DELETE ON subtrack_auth.login_proof TO subtrack_auth_executor;
GRANT UPDATE(proof_h) ON subtrack_auth.login_proof TO subtrack_auth_executor;
RESET ROLE;

CREATE FUNCTION subtrack_auth.reserve_login(key_h subtrack_auth.h,owner_h subtrack_auth.h,
  authority_h subtrack_auth.h,request_h subtrack_auth.h,operation pg_catalog.text,
  origin pg_catalog.text,epoch pg_catalog.text,manifest_h subtrack_auth.h,observed_ms subtrack_auth.ms)
RETURNS pg_catalog.int8 LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
CALLED ON NULL INPUT SET search_path=pg_catalog AS $reserve_login$
DECLARE e subtrack_auth.epoch%ROWTYPE; t pg_catalog.numeric; expiry pg_catalog.numeric; admitted pg_catalog.int8;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation')<>'read committed'
    OR key_h IS NULL OR owner_h IS NULL OR authority_h IS NULL OR request_h IS NULL
    OR operation NOT IN ('verifySimulatorLogin','createV2Session')
    OR origin IS NULL OR origin<>(CASE pg_catalog.current_database()
      WHEN 'st233a_development_auth_foundation_proof' THEN 'https://st233a.invalid'
      WHEN 'st237_private_https_profile' THEN 'https://localhost:3443' ELSE NULL END)
    OR epoch IS NULL OR epoch='' OR manifest_h IS NULL OR observed_ms IS NULL THEN RETURN NULL; END IF;
  SELECT x.* INTO e FROM subtrack_auth.epoch x WHERE x.id=reserve_login.epoch FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(233::pg_catalog.int4,4::pg_catalog.int4);
  t:=pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp())*1000::pg_catalog.numeric);
  expiry:=t+86400000;
  IF t<0 OR expiry>9007199254740991 OR t<e.watermark_ms OR observed_ms>t
    OR e.state<>'active' OR e.manifest_h<>manifest_h OR e.origin<>origin THEN RETURN NULL; END IF;
  IF (SELECT pg_catalog.count(*) FROM subtrack_auth.reservation)>=10000 THEN RETURN NULL; END IF;
  INSERT INTO subtrack_auth.reservation(key_h,operation,authority_kind,authority_h,request_h,
    owner_h,transport,epoch,issued_ms,expires_ms,state)
    VALUES (key_h,operation,'login-chain',authority_h,request_h,owner_h,'web',epoch,
      t::pg_catalog.int8::subtrack_auth.ms,expiry::pg_catalog.int8::subtrack_auth.ms,'pending')
    ON CONFLICT DO NOTHING RETURNING expires_ms::pg_catalog.int8 INTO admitted;
  RETURN admitted;
END $reserve_login$;
ALTER FUNCTION subtrack_auth.reserve_login(subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,pg_catalog.text,pg_catalog.text,pg_catalog.text,subtrack_auth.h,subtrack_auth.ms) OWNER TO subtrack_auth_executor;
REVOKE ALL ON FUNCTION subtrack_auth.reserve_login(subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,pg_catalog.text,pg_catalog.text,pg_catalog.text,subtrack_auth.h,subtrack_auth.ms) FROM PUBLIC,st233a_fixture_owner;
GRANT EXECUTE ON FUNCTION subtrack_auth.reserve_login(subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,pg_catalog.text,pg_catalog.text,pg_catalog.text,subtrack_auth.h,subtrack_auth.ms) TO subtrack_runtime,subtrack_auth_producer;

-- Fixed lock order: epoch, owned burn, nonce, proof, live owner.
CREATE FUNCTION subtrack_auth.login_material(scope subtrack_auth.login_scope,proof_h subtrack_auth.h)
RETURNS pg_catalog.uuid LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
CALLED ON NULL INPUT SET search_path=pg_catalog AS $login_material$
DECLARE e subtrack_auth.epoch%ROWTYPE; r subtrack_auth.reservation%ROWTYPE;
  n subtrack_auth.nonce%ROWTYPE; p subtrack_auth.login_proof%ROWTYPE; t pg_catalog.numeric;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation')<>'read committed' OR scope IS NULL
    OR (scope).key_h IS NULL OR (scope).owner_h IS NULL OR (scope).authority_h IS NULL
    OR (scope).request_h IS NULL OR (scope).nonce_h IS NULL OR (scope).binding_h IS NULL
    OR (scope).origin IS NULL OR (scope).origin<>(CASE pg_catalog.current_database()
      WHEN 'st233a_development_auth_foundation_proof' THEN 'https://st233a.invalid'
      WHEN 'st237_private_https_profile' THEN 'https://localhost:3443' ELSE NULL END)
    OR (scope).chain IS NULL OR (scope).chain='' OR (scope).epoch IS NULL OR (scope).epoch=''
    OR (scope).manifest_h IS NULL OR (scope).observed_ms IS NULL OR proof_h IS NULL
    OR (scope).authority_h<>proof_h THEN RETURN NULL; END IF;
  SELECT x.* INTO e FROM subtrack_auth.epoch x WHERE x.id=(scope).epoch FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT x.* INTO r FROM subtrack_auth.reservation x WHERE x.key_h=(scope).key_h FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT x.* INTO n FROM subtrack_auth.nonce x WHERE x.nonce_h=(scope).nonce_h FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT x.* INTO p FROM subtrack_auth.login_proof x WHERE x.proof_h=login_material.proof_h FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  t:=pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp())*1000::pg_catalog.numeric);
  IF t<0 OR t>9007199254740991 OR t<e.watermark_ms OR (scope).observed_ms>t
    OR e.state<>'active' OR e.manifest_h<>(scope).manifest_h OR e.origin<>(scope).origin
    OR r.owner_h<>(scope).owner_h OR r.authority_h<>(scope).authority_h
    OR r.request_h<>(scope).request_h OR r.operation<>'createV2Session'
    OR r.authority_kind<>'login-chain' OR r.transport<>'web' OR r.epoch<>(scope).epoch
    OR r.state<>'pending' OR r.issued_ms>t OR r.expires_ms<=t
    OR n.transport<>'web' OR n.origin<>(scope).origin OR n.chain<>(scope).chain
    OR n.binding_h<>(scope).binding_h OR n.epoch<>(scope).epoch OR n.purpose<>'session'
    OR n.authority_h IS DISTINCT FROM proof_h OR n.issued_ms>t OR n.expires_ms<=t
    OR p.terminal_nonce_h<>(scope).nonce_h OR p.origin<>(scope).origin
    OR p.chain<>(scope).chain OR p.binding_h<>(scope).binding_h OR p.epoch<>(scope).epoch
    OR p.issued_ms>t OR p.expires_ms<=t OR p.expires_ms>n.expires_ms
    THEN RETURN NULL; END IF;
  RETURN p.identity_id;
END $login_material$;
ALTER FUNCTION subtrack_auth.login_material(subtrack_auth.login_scope,subtrack_auth.h) OWNER TO subtrack_auth_executor;
REVOKE ALL ON FUNCTION subtrack_auth.login_material(subtrack_auth.login_scope,subtrack_auth.h) FROM PUBLIC,st233a_fixture_owner;
GRANT EXECUTE ON FUNCTION subtrack_auth.login_material(subtrack_auth.login_scope,subtrack_auth.h) TO subtrack_runtime;

CREATE FUNCTION subtrack_auth.issue_login(scope subtrack_auth.login_scope,proof_h subtrack_auth.h,
  terminal_nonce_h subtrack_auth.h,identity_id pg_catalog.uuid,subject_h subtrack_auth.h,
  session_binding_h subtrack_auth.h,verified_at_ms subtrack_auth.ms)
RETURNS pg_catalog.bool LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
CALLED ON NULL INPUT SET search_path=pg_catalog AS $issue_login$
DECLARE e subtrack_auth.epoch%ROWTYPE; r subtrack_auth.reservation%ROWTYPE;
  n subtrack_auth.nonce%ROWTYPE; t pg_catalog.numeric; expiry pg_catalog.numeric; changed pg_catalog.int4;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation')<>'read committed' OR scope IS NULL
    OR proof_h IS NULL OR terminal_nonce_h IS NULL OR proof_h=terminal_nonce_h
    OR terminal_nonce_h=(scope).nonce_h OR identity_id IS NULL OR subject_h IS NULL
    OR session_binding_h IS NULL OR verified_at_ms IS NULL
    OR (scope).key_h IS NULL OR (scope).owner_h IS NULL OR (scope).authority_h IS NULL
    OR (scope).request_h IS NULL OR (scope).nonce_h IS NULL OR (scope).binding_h IS NULL
    OR (scope).origin IS NULL OR (scope).origin<>(CASE pg_catalog.current_database()
      WHEN 'st233a_development_auth_foundation_proof' THEN 'https://st233a.invalid'
      WHEN 'st237_private_https_profile' THEN 'https://localhost:3443' ELSE NULL END)
    OR (scope).chain IS NULL OR (scope).chain='' OR (scope).epoch IS NULL OR (scope).epoch=''
    OR (scope).manifest_h IS NULL OR (scope).observed_ms IS NULL
    OR pg_catalog.current_setting('app.user_id',true) IS DISTINCT FROM identity_id::pg_catalog.text
    OR pg_catalog.current_setting('app.current_user_id',true) IS DISTINCT FROM identity_id::pg_catalog.text
    THEN RETURN false; END IF;
  SELECT x.* INTO e FROM subtrack_auth.epoch x WHERE x.id=(scope).epoch FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT x.* INTO r FROM subtrack_auth.reservation x WHERE x.key_h=(scope).key_h FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT x.* INTO n FROM subtrack_auth.nonce x WHERE x.nonce_h=(scope).nonce_h FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  t:=pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp())*1000::pg_catalog.numeric);
  expiry:=pg_catalog.least(t+300000,verified_at_ms+300000,n.expires_ms);
  IF t<0 OR t>9007199254740991 OR t<e.watermark_ms OR (scope).observed_ms>t
    OR e.state<>'active' OR e.manifest_h<>(scope).manifest_h OR e.origin<>(scope).origin
    OR r.owner_h<>(scope).owner_h OR r.authority_h<>(scope).authority_h
    OR r.request_h<>(scope).request_h OR r.operation<>'verifySimulatorLogin'
    OR r.authority_kind<>'login-chain' OR r.transport<>'web' OR r.epoch<>(scope).epoch
    OR r.state<>'pending' OR r.issued_ms>t OR r.expires_ms<=t
    OR n.transport<>'web' OR n.origin<>(scope).origin OR n.chain<>(scope).chain
    OR n.binding_h<>(scope).binding_h OR n.epoch<>(scope).epoch OR n.purpose<>'session'
    OR n.authority_h IS NOT NULL OR n.issued_ms>t OR n.expires_ms<=t
    OR verified_at_ms>t OR expiry<=t THEN RETURN false; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(239::pg_catalog.int4,1::pg_catalog.int4);
  IF (SELECT pg_catalog.count(*) FROM subtrack_auth.login_proof)>=10000 THEN RETURN false; END IF;
  -- The caller's provisioner lookup is only a candidate. This row is locked and
  -- independently checked under executor RLS with both server-derived GUCs.
  PERFORM 1 FROM public.identity i WHERE i.id=issue_login.identity_id
    AND i.external_id=issue_login.subject_h::pg_catalog.text AND i.deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  DELETE FROM subtrack_auth.nonce x WHERE x.nonce_h=(scope).nonce_h AND x.authority_h IS NULL
    AND x.purpose='session' AND x.origin=(scope).origin AND x.chain=(scope).chain
    AND x.binding_h=(scope).binding_h AND x.epoch=(scope).epoch AND x.expires_ms>t;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RETURN false; END IF;
  t:=pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp())*1000::pg_catalog.numeric);
  IF t>=expiry THEN RAISE EXCEPTION USING ERRCODE='22012',MESSAGE='login source expired'; END IF;
  INSERT INTO subtrack_auth.nonce VALUES (terminal_nonce_h,'web',(scope).origin,(scope).chain,
    (scope).binding_h,(scope).epoch,t::subtrack_auth.ms,(t+300000)::subtrack_auth.ms,'session',proof_h);
  INSERT INTO subtrack_auth.login_proof VALUES (proof_h,identity_id,subject_h,terminal_nonce_h,
    (scope).origin,(scope).chain,(scope).binding_h,session_binding_h,(scope).epoch,
    t::subtrack_auth.ms,expiry::pg_catalog.int8::subtrack_auth.ms);
  UPDATE subtrack_auth.reservation x SET state='completed' WHERE x.key_h=(scope).key_h
    AND x.owner_h=(scope).owner_h AND x.authority_h=(scope).authority_h
    AND x.request_h=(scope).request_h AND x.operation='verifySimulatorLogin'
    AND x.authority_kind='login-chain' AND x.state='pending';
  RETURN FOUND;
END $issue_login$;
ALTER FUNCTION subtrack_auth.issue_login(subtrack_auth.login_scope,subtrack_auth.h,subtrack_auth.h,pg_catalog.uuid,subtrack_auth.h,subtrack_auth.h,subtrack_auth.ms) OWNER TO subtrack_auth_executor;
REVOKE ALL ON FUNCTION subtrack_auth.issue_login(subtrack_auth.login_scope,subtrack_auth.h,subtrack_auth.h,pg_catalog.uuid,subtrack_auth.h,subtrack_auth.h,subtrack_auth.ms) FROM PUBLIC,st233a_fixture_owner;
GRANT EXECUTE ON FUNCTION subtrack_auth.issue_login(subtrack_auth.login_scope,subtrack_auth.h,subtrack_auth.h,pg_catalog.uuid,subtrack_auth.h,subtrack_auth.h,subtrack_auth.ms) TO subtrack_auth_producer;

CREATE FUNCTION subtrack_auth.consume_login(scope subtrack_auth.login_scope,proof_h subtrack_auth.h,
  identity_id pg_catalog.uuid,sid pg_catalog.uuid,fid pg_catalog.uuid,
  refresh_h subtrack_auth.h,csrf_h subtrack_auth.h)
RETURNS pg_catalog.bool LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
CALLED ON NULL INPUT SET search_path=pg_catalog AS $consume_login$
DECLARE current_owner pg_catalog.uuid; p subtrack_auth.login_proof%ROWTYPE;
  t pg_catalog.int8; changed pg_catalog.int4;
BEGIN
  IF proof_h IS NULL OR identity_id IS NULL OR sid IS NULL OR fid IS NULL OR sid=fid
    OR refresh_h IS NULL OR csrf_h IS NULL OR refresh_h=csrf_h
    OR pg_catalog.current_setting('app.user_id',true) IS DISTINCT FROM identity_id::pg_catalog.text
    OR pg_catalog.current_setting('app.current_user_id',true) IS DISTINCT FROM identity_id::pg_catalog.text
    THEN RETURN false; END IF;
  current_owner:=subtrack_auth.login_material(scope,proof_h);
  IF current_owner IS DISTINCT FROM identity_id THEN RETURN false; END IF;
  SELECT x.* INTO p FROM subtrack_auth.login_proof x WHERE x.proof_h=consume_login.proof_h FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public.identity i WHERE i.id=identity_id AND i.external_id=p.subject_h::pg_catalog.text
    AND i.deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  t:=pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp())*1000::pg_catalog.numeric)::pg_catalog.int8;
  IF p.expires_ms<=t THEN RETURN false; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(235::pg_catalog.int4,1::pg_catalog.int4);
  IF (SELECT pg_catalog.count(*) FROM subtrack_auth.session)>=10000 THEN RETURN false; END IF;
  INSERT INTO subtrack_auth.family VALUES (fid,identity_id,(scope).epoch,
    t::subtrack_auth.ms,(t+86400000)::subtrack_auth.ms,NULL);
  INSERT INTO subtrack_auth.session VALUES (sid,fid,identity_id,'web',(scope).origin,(scope).chain,
    p.session_binding_h,(scope).epoch,t::subtrack_auth.ms,(t+86400000)::subtrack_auth.ms,NULL);
  INSERT INTO subtrack_auth.credential VALUES (refresh_h,sid,fid,identity_id,(scope).epoch,'current',
    t::subtrack_auth.ms,(t+86400000)::subtrack_auth.ms);
  INSERT INTO subtrack_auth.csrf VALUES (sid,fid,identity_id,(scope).epoch,csrf_h,
    t::subtrack_auth.ms,(t+86400000)::subtrack_auth.ms);
  DELETE FROM subtrack_auth.login_proof x WHERE x.proof_h=consume_login.proof_h
    AND x.identity_id=identity_id AND x.expires_ms>t;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION USING ERRCODE='22012',MESSAGE='login proof consumption'; END IF;
  DELETE FROM subtrack_auth.nonce x WHERE x.nonce_h=(scope).nonce_h
    AND x.authority_h=proof_h AND x.purpose='session' AND x.origin=(scope).origin
    AND x.chain=(scope).chain AND x.binding_h=(scope).binding_h AND x.epoch=(scope).epoch
    AND x.expires_ms>t;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION USING ERRCODE='22012',MESSAGE='login nonce consumption'; END IF;
  UPDATE subtrack_auth.reservation x SET state='completed' WHERE x.key_h=(scope).key_h
    AND x.owner_h=(scope).owner_h AND x.authority_h=(scope).authority_h
    AND x.request_h=(scope).request_h AND x.operation='createV2Session'
    AND x.authority_kind='login-chain' AND x.state='pending';
  RETURN FOUND;
END $consume_login$;
ALTER FUNCTION subtrack_auth.consume_login(subtrack_auth.login_scope,subtrack_auth.h,pg_catalog.uuid,pg_catalog.uuid,pg_catalog.uuid,subtrack_auth.h,subtrack_auth.h) OWNER TO subtrack_auth_executor;
REVOKE ALL ON FUNCTION subtrack_auth.consume_login(subtrack_auth.login_scope,subtrack_auth.h,pg_catalog.uuid,pg_catalog.uuid,pg_catalog.uuid,subtrack_auth.h,subtrack_auth.h) FROM PUBLIC,st233a_fixture_owner;
GRANT EXECUTE ON FUNCTION subtrack_auth.consume_login(subtrack_auth.login_scope,subtrack_auth.h,pg_catalog.uuid,pg_catalog.uuid,pg_catalog.uuid,subtrack_auth.h,subtrack_auth.h) TO subtrack_runtime;

CREATE FUNCTION subtrack_auth.fail_login_burn(scope subtrack_auth.login_scope)
RETURNS pg_catalog.bool LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
CALLED ON NULL INPUT SET search_path=pg_catalog AS $fail_login_burn$
DECLARE e subtrack_auth.epoch%ROWTYPE; t pg_catalog.int8; changed pg_catalog.int4;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation')<>'read committed' OR scope IS NULL
    OR (scope).key_h IS NULL OR (scope).owner_h IS NULL OR (scope).authority_h IS NULL
    OR (scope).request_h IS NULL OR (scope).origin IS NULL OR (scope).epoch IS NULL
    OR (scope).manifest_h IS NULL OR (scope).observed_ms IS NULL THEN RETURN false; END IF;
  SELECT x.* INTO e FROM subtrack_auth.epoch x WHERE x.id=(scope).epoch FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  t:=pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp())*1000::pg_catalog.numeric)::pg_catalog.int8;
  IF e.manifest_h<>(scope).manifest_h OR e.origin<>(scope).origin OR (scope).observed_ms>t
    OR t<e.watermark_ms OR (scope).origin<>(CASE pg_catalog.current_database()
      WHEN 'st233a_development_auth_foundation_proof' THEN 'https://st233a.invalid'
      WHEN 'st237_private_https_profile' THEN 'https://localhost:3443' ELSE NULL END) THEN RETURN false; END IF;
  UPDATE subtrack_auth.reservation x SET state='failed' WHERE x.key_h=(scope).key_h
    AND x.owner_h=(scope).owner_h AND x.authority_h=(scope).authority_h
    AND x.request_h=(scope).request_h AND x.epoch=(scope).epoch
    AND x.operation IN ('verifySimulatorLogin','createV2Session')
    AND x.authority_kind='login-chain' AND x.transport='web' AND x.state='pending';
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN changed=1;
END $fail_login_burn$;
ALTER FUNCTION subtrack_auth.fail_login_burn(subtrack_auth.login_scope) OWNER TO subtrack_auth_executor;
REVOKE ALL ON FUNCTION subtrack_auth.fail_login_burn(subtrack_auth.login_scope) FROM PUBLIC,st233a_fixture_owner;
GRANT EXECUTE ON FUNCTION subtrack_auth.fail_login_burn(subtrack_auth.login_scope) TO subtrack_runtime,subtrack_auth_producer;

CREATE FUNCTION subtrack_auth.prune_login(epoch pg_catalog.text,manifest_h subtrack_auth.h,observed_ms subtrack_auth.ms)
RETURNS pg_catalog.bool LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
CALLED ON NULL INPUT SET search_path=pg_catalog AS $prune_login$
DECLARE e subtrack_auth.epoch%ROWTYPE; t pg_catalog.int8;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation')<>'read committed'
    OR epoch IS NULL OR epoch='' OR manifest_h IS NULL OR observed_ms IS NULL THEN RETURN false; END IF;
  SELECT x.* INTO e FROM subtrack_auth.epoch x WHERE x.id=prune_login.epoch FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  t:=pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp())*1000::pg_catalog.numeric)::pg_catalog.int8;
  IF t<0 OR t>9007199254740991 OR t<e.watermark_ms OR observed_ms>t
    OR e.state<>'active' OR e.manifest_h<>manifest_h OR e.origin<>(CASE pg_catalog.current_database()
      WHEN 'st233a_development_auth_foundation_proof' THEN 'https://st233a.invalid'
      WHEN 'st237_private_https_profile' THEN 'https://localhost:3443' ELSE NULL END) THEN RETURN false; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(239::pg_catalog.int4,1::pg_catalog.int4);
  t:=pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp())*1000::pg_catalog.numeric)::pg_catalog.int8;
  DELETE FROM subtrack_auth.login_proof x WHERE x.epoch=prune_login.epoch AND x.expires_ms<=t;
  RETURN true;
END $prune_login$;
ALTER FUNCTION subtrack_auth.prune_login(pg_catalog.text,subtrack_auth.h,subtrack_auth.ms) OWNER TO subtrack_auth_executor;
REVOKE ALL ON FUNCTION subtrack_auth.prune_login(pg_catalog.text,subtrack_auth.h,subtrack_auth.ms) FROM PUBLIC,st233a_fixture_owner;
GRANT EXECUTE ON FUNCTION subtrack_auth.prune_login(pg_catalog.text,subtrack_auth.h,subtrack_auth.ms) TO subtrack_runtime,subtrack_auth_producer;
COMMIT;
