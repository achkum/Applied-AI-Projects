-- ST-236: private durable enrollment on the qualified, pinned PG16 foundation.
-- Apply with psql ON_ERROR_STOP after SQL001-009. All application transitions use READ COMMITTED.
BEGIN;
SET LOCAL search_path = pg_catalog;
SELECT 1 / COALESCE((pg_catalog.current_database() = 'st233a_development_auth_foundation_proof'
  AND SESSION_USER = 'st233a_fixture_owner'
  AND pg_catalog.current_setting('server_version_num')::pg_catalog.int4 BETWEEN 160000 AND 169999
  AND EXISTS (SELECT 1 FROM public.st233a_fixture_control c WHERE c.task='ST-233a'
    AND c.head=pg_catalog.current_setting('st233a.head') AND c.marker=pg_catalog.current_setting('st233a.marker')
    AND c.marker ~ '^[a-f0-9]{32}$')
  AND (SELECT nspowner='subtrack_auth_owner'::pg_catalog.regrole FROM pg_catalog.pg_namespace WHERE nspname='subtrack_auth')
  AND (SELECT pg_catalog.count(*)=4 AND pg_catalog.bool_and(NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
    AND NOT rolbypassrls AND NOT rolinherit AND rolcanlogin=(rolname='subtrack_dev_auth_login'))
    FROM pg_catalog.pg_roles WHERE rolname IN ('subtrack_auth_owner','subtrack_auth_executor','subtrack_auth_producer','subtrack_dev_auth_login'))
  AND (SELECT pg_catalog.count(*)=3 AND pg_catalog.bool_and(NOT admin_option AND NOT inherit_option AND set_option
    AND roleid IN ('subtrack_runtime'::pg_catalog.regrole,'subtrack_identity_provisioner'::pg_catalog.regrole,
      'subtrack_auth_producer'::pg_catalog.regrole)) FROM pg_catalog.pg_auth_members
    WHERE member='subtrack_dev_auth_login'::pg_catalog.regrole)
  AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members WHERE member='subtrack_dev_auth_login'::pg_catalog.regrole
    AND roleid IN ('subtrack_auth_owner'::pg_catalog.regrole,'subtrack_auth_executor'::pg_catalog.regrole))
  AND to_regclass('subtrack_auth.csrf') IS NOT NULL AND to_regprocedure(
    'subtrack_auth.check_current_web(uuid,uuid,text,text,subtrack_auth.h,subtrack_auth.h,text,subtrack_auth.h,subtrack_auth.ms)') IS NOT NULL
  AND to_regclass('subtrack_auth.otp') IS NULL AND to_regclass('public.identity_profile') IS NULL
  AND to_regprocedure('subtrack_auth.issue_fixture(uuid,uuid,uuid,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,text,text,text,subtrack_auth.h,subtrack_auth.ms)') IS NOT NULL
),false)::pg_catalog.int4;

-- The executor's only business-table read is the exact new row to which the
-- runtime has already set both server-derived owner settings and held a lock.
GRANT USAGE ON SCHEMA public TO subtrack_auth_executor;
GRANT SELECT(id,external_id,deleted_at) ON public.identity TO subtrack_auth_executor;
CREATE POLICY identity_enrollment_executor_select ON public.identity FOR SELECT TO subtrack_auth_executor
  USING (id::pg_catalog.text = pg_catalog.current_setting('app.user_id',true)
    AND id::pg_catalog.text = pg_catalog.current_setting('app.current_user_id',true));
ALTER TABLE public.identity ADD COLUMN verified_at pg_catalog.timestamptz,
  ADD COLUMN given_name pg_catalog.varchar(120), ADD COLUMN surname pg_catalog.varchar(120);
CREATE TABLE public.identity_profile (
  identity_id pg_catalog.uuid PRIMARY KEY REFERENCES public.identity(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  display_name pg_catalog.varchar(120), avatar_color pg_catalog.varchar(32), avatar_emoji pg_catalog.varchar(32),
  language pg_catalog.varchar(2) NOT NULL DEFAULT 'en' CHECK (language IN ('sv','en')),
  theme pg_catalog.varchar(16) NOT NULL DEFAULT 'system' CHECK (theme IN ('system','light','dark')),
  default_currency pg_catalog.char(3) NOT NULL DEFAULT 'SEK' CHECK (default_currency='SEK'),
  profile_complete pg_catalog.bool NOT NULL DEFAULT false,
  created_at pg_catalog.timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at pg_catalog.timestamptz NOT NULL DEFAULT pg_catalog.now()
);
REVOKE ALL ON public.identity_profile FROM PUBLIC;
ALTER TABLE public.identity_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.identity_profile FORCE ROW LEVEL SECURITY;
CREATE POLICY identity_profile_select ON public.identity_profile FOR SELECT TO subtrack_runtime
  USING (public.subtrack_principal_matches(identity_id));
CREATE POLICY identity_profile_insert ON public.identity_profile FOR INSERT TO subtrack_runtime
  WITH CHECK (public.subtrack_principal_matches(identity_id));
CREATE POLICY identity_profile_update ON public.identity_profile FOR UPDATE TO subtrack_runtime
  USING (public.subtrack_principal_matches(identity_id)) WITH CHECK (public.subtrack_principal_matches(identity_id));
GRANT SELECT,INSERT ON public.identity_profile TO subtrack_runtime;
GRANT UPDATE(display_name,avatar_color,avatar_emoji,language,theme,default_currency,profile_complete,updated_at)
  ON public.identity_profile TO subtrack_runtime;

SET LOCAL ROLE subtrack_auth_owner;
CREATE TYPE subtrack_auth.enrollment_scope AS (
  key_h subtrack_auth.h, owner_h subtrack_auth.h, authority_h subtrack_auth.h, request_h subtrack_auth.h,
  nonce_h subtrack_auth.h, binding_h subtrack_auth.h, origin pg_catalog.text, chain pg_catalog.text,
  epoch pg_catalog.text, manifest_h subtrack_auth.h, observed_ms subtrack_auth.ms
);
REVOKE ALL ON TYPE subtrack_auth.enrollment_scope FROM PUBLIC;
GRANT USAGE ON TYPE subtrack_auth.enrollment_scope TO subtrack_runtime,subtrack_auth_producer,subtrack_auth_executor;

CREATE TABLE subtrack_auth.otp (
  challenge_h subtrack_auth.h PRIMARY KEY, code_h subtrack_auth.h NOT NULL,
  identifier_h subtrack_auth.h NOT NULL, channel pg_catalog.text NOT NULL CHECK (channel IN ('email','sms')),
  contact pg_catalog.text NOT NULL CHECK (pg_catalog.length(contact) BETWEEN 3 AND 320),
  origin pg_catalog.text NOT NULL CHECK (origin='https://st233a.invalid'), chain pg_catalog.text NOT NULL CHECK (chain<>''),
  binding_h subtrack_auth.h NOT NULL, session_binding_h subtrack_auth.h NOT NULL,
  epoch pg_catalog.text NOT NULL REFERENCES subtrack_auth.epoch(id),
  issued_ms subtrack_auth.ms NOT NULL, expires_ms subtrack_auth.ms NOT NULL,
  attempts pg_catalog.int2 NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  CHECK (expires_ms>issued_ms AND expires_ms-issued_ms<=300000)
);
CREATE TABLE subtrack_auth.restricted_proof (
  proof_h subtrack_auth.h PRIMARY KEY, challenge_h subtrack_auth.h NOT NULL REFERENCES subtrack_auth.otp(challenge_h),
  purpose pg_catalog.text NOT NULL CHECK (purpose='enrollment'),
  origin pg_catalog.text NOT NULL CHECK (origin='https://st233a.invalid'), chain pg_catalog.text NOT NULL CHECK (chain<>''),
  binding_h subtrack_auth.h NOT NULL, session_binding_h subtrack_auth.h NOT NULL,
  epoch pg_catalog.text NOT NULL REFERENCES subtrack_auth.epoch(id),
  issued_ms subtrack_auth.ms NOT NULL, expires_ms subtrack_auth.ms NOT NULL,
  CHECK (expires_ms>issued_ms AND expires_ms-issued_ms<=300000)
);
CREATE TABLE subtrack_auth.pending_enrollment (
  pending_h subtrack_auth.h PRIMARY KEY, challenge_h subtrack_auth.h NOT NULL REFERENCES subtrack_auth.otp(challenge_h),
  identifier_h subtrack_auth.h NOT NULL, channel pg_catalog.text NOT NULL CHECK (channel IN ('email','sms')),
  contact pg_catalog.text NOT NULL, origin pg_catalog.text NOT NULL CHECK (origin='https://st233a.invalid'),
  chain pg_catalog.text NOT NULL CHECK (chain<>''), binding_h subtrack_auth.h NOT NULL,
  session_binding_h subtrack_auth.h NOT NULL,
  epoch pg_catalog.text NOT NULL REFERENCES subtrack_auth.epoch(id),
  issued_ms subtrack_auth.ms NOT NULL, expires_ms subtrack_auth.ms NOT NULL,
  CHECK (expires_ms>issued_ms AND expires_ms-issued_ms<=300000)
);
CREATE TABLE subtrack_auth.verified_enrollment (
  verified_h subtrack_auth.h PRIMARY KEY, pending_h subtrack_auth.h NOT NULL UNIQUE,
  subject_h subtrack_auth.h NOT NULL, channel pg_catalog.text NOT NULL CHECK (channel IN ('email','sms')),
  contact pg_catalog.text NOT NULL, verified_at pg_catalog.text NOT NULL,
  given_name pg_catalog.text NOT NULL CHECK (pg_catalog.length(given_name) BETWEEN 1 AND 120),
  surname pg_catalog.text NOT NULL CHECK (pg_catalog.length(surname) BETWEEN 1 AND 120),
  terminal_nonce_h subtrack_auth.h NOT NULL UNIQUE REFERENCES subtrack_auth.nonce(nonce_h)
    DEFERRABLE INITIALLY DEFERRED,
  identity_id pg_catalog.uuid UNIQUE, origin pg_catalog.text NOT NULL CHECK (origin='https://st233a.invalid'),
  chain pg_catalog.text NOT NULL CHECK (chain<>''), binding_h subtrack_auth.h NOT NULL,
  session_binding_h subtrack_auth.h NOT NULL,
  epoch pg_catalog.text NOT NULL REFERENCES subtrack_auth.epoch(id),
  issued_ms subtrack_auth.ms NOT NULL, expires_ms subtrack_auth.ms NOT NULL,
  CHECK (expires_ms>issued_ms AND expires_ms-issued_ms<=300000)
);
-- Transaction-scoped attestation. Neither table retains a subject, contact,
-- or reusable identity authority after terminal consumption.
CREATE TABLE subtrack_auth.enrollment_intent (
  xid pg_catalog.xid8 NOT NULL, verified_h subtrack_auth.h NOT NULL,
  expires_ms subtrack_auth.ms NOT NULL, PRIMARY KEY(xid,verified_h)
);
CREATE TABLE subtrack_auth.identity_birth (
  identity_id pg_catalog.uuid PRIMARY KEY, xid pg_catalog.xid8 NOT NULL
);
ALTER TABLE subtrack_auth.otp ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtrack_auth.otp FORCE ROW LEVEL SECURITY;
ALTER TABLE subtrack_auth.restricted_proof ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtrack_auth.restricted_proof FORCE ROW LEVEL SECURITY;
ALTER TABLE subtrack_auth.pending_enrollment ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtrack_auth.pending_enrollment FORCE ROW LEVEL SECURITY;
ALTER TABLE subtrack_auth.verified_enrollment ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtrack_auth.verified_enrollment FORCE ROW LEVEL SECURITY;
ALTER TABLE subtrack_auth.enrollment_intent ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtrack_auth.enrollment_intent FORCE ROW LEVEL SECURITY;
ALTER TABLE subtrack_auth.identity_birth ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtrack_auth.identity_birth FORCE ROW LEVEL SECURITY;
CREATE POLICY otp_select ON subtrack_auth.otp FOR SELECT TO subtrack_auth_executor USING (true);
CREATE POLICY otp_insert ON subtrack_auth.otp FOR INSERT TO subtrack_auth_executor WITH CHECK (true);
CREATE POLICY otp_update ON subtrack_auth.otp FOR UPDATE TO subtrack_auth_executor USING (true) WITH CHECK (true);
CREATE POLICY otp_delete ON subtrack_auth.otp FOR DELETE TO subtrack_auth_executor USING (true);
CREATE POLICY proof_select ON subtrack_auth.restricted_proof FOR SELECT TO subtrack_auth_executor USING (true);
CREATE POLICY proof_insert ON subtrack_auth.restricted_proof FOR INSERT TO subtrack_auth_executor WITH CHECK (true);
CREATE POLICY proof_delete ON subtrack_auth.restricted_proof FOR DELETE TO subtrack_auth_executor USING (true);
CREATE POLICY pending_select ON subtrack_auth.pending_enrollment FOR SELECT TO subtrack_auth_executor USING (true);
CREATE POLICY pending_insert ON subtrack_auth.pending_enrollment FOR INSERT TO subtrack_auth_executor WITH CHECK (true);
CREATE POLICY pending_delete ON subtrack_auth.pending_enrollment FOR DELETE TO subtrack_auth_executor USING (true);
CREATE POLICY verified_select ON subtrack_auth.verified_enrollment FOR SELECT TO subtrack_auth_executor USING (true);
CREATE POLICY verified_insert ON subtrack_auth.verified_enrollment FOR INSERT TO subtrack_auth_executor WITH CHECK (true);
CREATE POLICY verified_update ON subtrack_auth.verified_enrollment FOR UPDATE TO subtrack_auth_executor USING (true) WITH CHECK (true);
CREATE POLICY verified_delete ON subtrack_auth.verified_enrollment FOR DELETE TO subtrack_auth_executor USING (true);
CREATE POLICY enrollment_intent_select ON subtrack_auth.enrollment_intent FOR SELECT TO subtrack_auth_executor USING (true);
CREATE POLICY enrollment_intent_insert ON subtrack_auth.enrollment_intent FOR INSERT TO subtrack_auth_executor WITH CHECK (true);
CREATE POLICY enrollment_intent_delete ON subtrack_auth.enrollment_intent FOR DELETE TO subtrack_auth_executor USING (true);
CREATE POLICY identity_birth_select ON subtrack_auth.identity_birth FOR SELECT TO subtrack_auth_executor USING (true);
CREATE POLICY identity_birth_insert ON subtrack_auth.identity_birth FOR INSERT TO subtrack_auth_executor WITH CHECK (true);
CREATE POLICY identity_birth_delete ON subtrack_auth.identity_birth FOR DELETE TO subtrack_auth_executor USING (true);
REVOKE ALL ON subtrack_auth.otp,subtrack_auth.restricted_proof,subtrack_auth.pending_enrollment,
  subtrack_auth.verified_enrollment,subtrack_auth.enrollment_intent,subtrack_auth.identity_birth FROM PUBLIC;
GRANT SELECT,INSERT,DELETE ON subtrack_auth.otp,subtrack_auth.restricted_proof,
  subtrack_auth.pending_enrollment,subtrack_auth.verified_enrollment TO subtrack_auth_executor;
GRANT UPDATE(attempts) ON subtrack_auth.otp TO subtrack_auth_executor;
GRANT UPDATE(identity_id) ON subtrack_auth.verified_enrollment TO subtrack_auth_executor;
GRANT SELECT,INSERT,DELETE ON subtrack_auth.enrollment_intent,subtrack_auth.identity_birth TO subtrack_auth_executor;
RESET ROLE;

-- An ordinary or old-owner INSERT has no current qualified terminal intent.
-- The trigger runs as the executor but observes the caller's SET ROLE state.
CREATE FUNCTION subtrack_auth.attest_enrollment_birth()
RETURNS pg_catalog.trigger LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path=pg_catalog AS $birth$
DECLARE x pg_catalog.xid8; t pg_catalog.int8;
BEGIN
  IF SESSION_USER<>'subtrack_dev_auth_login'
    OR pg_catalog.current_setting('role',true)<>'subtrack_identity_provisioner'
    OR NEW.external_id IS NULL OR NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  x:=pg_catalog.pg_current_xact_id();
  t:=pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp())*1000::pg_catalog.numeric)::pg_catalog.int8;
  IF NOT EXISTS (SELECT 1 FROM subtrack_auth.enrollment_intent a
    JOIN subtrack_auth.verified_enrollment v ON v.verified_h=a.verified_h
    WHERE a.xid=x AND a.expires_ms>t AND v.identity_id IS NULL
      AND v.subject_h::pg_catalog.text=NEW.external_id
      AND v.issued_ms<=t AND v.expires_ms>t) THEN RETURN NEW; END IF;
  INSERT INTO subtrack_auth.identity_birth(identity_id,xid) VALUES (NEW.id,x);
  RETURN NEW;
END $birth$;
ALTER FUNCTION subtrack_auth.attest_enrollment_birth() OWNER TO subtrack_auth_executor;
CREATE TRIGGER identity_enrollment_birth AFTER INSERT ON public.identity
  FOR EACH ROW EXECUTE FUNCTION subtrack_auth.attest_enrollment_birth();
REVOKE ALL ON FUNCTION subtrack_auth.attest_enrollment_birth() FROM PUBLIC,st233a_fixture_owner;

-- Private helper, callable only by its executor-owned fixed functions. It
-- serializes epoch then owned burn, samples time after waits, and compares the
-- entire browser scope. The nonce is consumed by the transition itself.
CREATE FUNCTION subtrack_auth.enrollment_checked_ms(s subtrack_auth.enrollment_scope,
  expected_operation pg_catalog.text,expected_purpose pg_catalog.text,expected_authority subtrack_auth.h)
RETURNS pg_catalog.int8 LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
CALLED ON NULL INPUT SET search_path=pg_catalog AS $checked$
DECLARE e subtrack_auth.epoch%ROWTYPE; r subtrack_auth.reservation%ROWTYPE;
  n subtrack_auth.nonce%ROWTYPE; t pg_catalog.numeric;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed'
    OR s IS NULL OR (s).key_h IS NULL OR (s).owner_h IS NULL OR (s).authority_h IS NULL
    OR (s).request_h IS NULL OR (s).nonce_h IS NULL OR (s).binding_h IS NULL
    OR (s).origin IS NULL OR (s).origin <> 'https://st233a.invalid'
    OR (s).chain IS NULL OR (s).chain = '' OR (s).epoch IS NULL OR (s).epoch = ''
    OR (s).manifest_h IS NULL OR (s).observed_ms IS NULL THEN RETURN NULL; END IF;
  SELECT x.* INTO e FROM subtrack_auth.epoch x WHERE x.id=(s).epoch FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT x.* INTO r FROM subtrack_auth.reservation x WHERE x.key_h=(s).key_h FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT x.* INTO n FROM subtrack_auth.nonce x WHERE x.nonce_h=(s).nonce_h;
  IF NOT FOUND THEN RETURN NULL; END IF;
  t := pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp())*1000::pg_catalog.numeric);
  IF t<0 OR t>9007199168340991 OR t<e.watermark_ms OR (s).observed_ms>t
    OR e.state<>'active' OR e.manifest_h<>(s).manifest_h OR e.origin<>(s).origin
    OR r.owner_h<>(s).owner_h OR r.authority_h<>(s).authority_h OR r.request_h<>(s).request_h
    OR r.operation<>expected_operation OR r.authority_kind<>'enrollment-chain'
    OR r.transport<>'web' OR r.epoch<>(s).epoch OR r.state<>'pending'
    OR r.issued_ms>t OR r.expires_ms<=t
    OR n.transport<>'web' OR n.origin<>(s).origin OR n.chain<>(s).chain
    OR n.binding_h<>(s).binding_h OR n.epoch<>(s).epoch OR n.purpose<>expected_purpose
    OR n.authority_h IS DISTINCT FROM expected_authority OR n.issued_ms>t OR n.expires_ms<=t
    THEN RETURN NULL; END IF;
  RETURN t::pg_catalog.int8;
END $checked$;
ALTER FUNCTION subtrack_auth.enrollment_checked_ms(subtrack_auth.enrollment_scope,pg_catalog.text,pg_catalog.text,subtrack_auth.h) OWNER TO subtrack_auth_executor;
REVOKE ALL ON FUNCTION subtrack_auth.enrollment_checked_ms(subtrack_auth.enrollment_scope,pg_catalog.text,pg_catalog.text,subtrack_auth.h) FROM PUBLIC,st233a_fixture_owner;

-- Reservation is the original table: key_h remains globally unique across
-- bootstrap and enrollment operations. No result or credential is stored.
CREATE FUNCTION subtrack_auth.reserve_enrollment(key_h subtrack_auth.h,owner_h subtrack_auth.h,
  authority_h subtrack_auth.h,request_h subtrack_auth.h,operation pg_catalog.text,origin pg_catalog.text,
  epoch pg_catalog.text,manifest_h subtrack_auth.h,observed_ms subtrack_auth.ms)
RETURNS pg_catalog.int8 LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
CALLED ON NULL INPUT SET search_path=pg_catalog AS $reserve$
DECLARE e subtrack_auth.epoch%ROWTYPE; t pg_catalog.numeric; expiry pg_catalog.numeric;
  admitted pg_catalog.int8;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation')<>'read committed'
    OR key_h IS NULL OR owner_h IS NULL OR authority_h IS NULL OR request_h IS NULL
    OR origin IS NULL OR origin<>'https://st233a.invalid' OR epoch IS NULL OR epoch=''
    OR manifest_h IS NULL OR observed_ms IS NULL
    OR operation IS NULL OR operation NOT IN ('startV2Otp','verifyV2Otp','admitEnrollment',
      'verifyEnrollmentPerson','completeEnrollment') THEN RETURN NULL; END IF;
  SELECT x.* INTO e FROM subtrack_auth.epoch x WHERE x.id=reserve_enrollment.epoch FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(233::pg_catalog.int4,4::pg_catalog.int4);
  t:=pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp())*1000::pg_catalog.numeric);
  expiry:=t+86400000;
  IF t<0 OR expiry>9007199254740991 OR t<e.watermark_ms OR observed_ms>t
    OR e.state<>'active' OR e.manifest_h<>manifest_h OR e.origin<>origin THEN RETURN NULL; END IF;
  IF (SELECT pg_catalog.count(*) FROM subtrack_auth.reservation)>=10000 THEN RETURN NULL; END IF;
  INSERT INTO subtrack_auth.reservation(key_h,operation,authority_kind,authority_h,request_h,
    owner_h,transport,epoch,issued_ms,expires_ms,state)
    VALUES (key_h,operation,'enrollment-chain',authority_h,request_h,owner_h,'web',epoch,
      t::pg_catalog.int8::subtrack_auth.ms,expiry::pg_catalog.int8::subtrack_auth.ms,'pending')
    ON CONFLICT DO NOTHING RETURNING expires_ms::pg_catalog.int8 INTO admitted;
  RETURN admitted;
END $reserve$;
ALTER FUNCTION subtrack_auth.reserve_enrollment(subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,pg_catalog.text,pg_catalog.text,pg_catalog.text,subtrack_auth.h,subtrack_auth.ms) OWNER TO subtrack_auth_executor;
REVOKE ALL ON FUNCTION subtrack_auth.reserve_enrollment(subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,pg_catalog.text,pg_catalog.text,pg_catalog.text,subtrack_auth.h,subtrack_auth.ms) FROM PUBLIC,st233a_fixture_owner;
GRANT EXECUTE ON FUNCTION subtrack_auth.reserve_enrollment(subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,pg_catalog.text,pg_catalog.text,pg_catalog.text,subtrack_auth.h,subtrack_auth.ms) TO subtrack_runtime,subtrack_auth_producer;

CREATE FUNCTION subtrack_auth.issue_enrollment_otp(scope subtrack_auth.enrollment_scope,
  challenge_h subtrack_auth.h,code_h subtrack_auth.h,identifier_h subtrack_auth.h,
  contact pg_catalog.text,channel pg_catalog.text,next_nonce_h subtrack_auth.h,
  source_expires_ms subtrack_auth.ms,session_binding_h subtrack_auth.h)
RETURNS pg_catalog.bool LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
CALLED ON NULL INPUT SET search_path=pg_catalog AS $issue$
DECLARE t pg_catalog.int8; changed pg_catalog.int4;
BEGIN
  IF challenge_h IS NULL OR code_h IS NULL OR identifier_h IS NULL OR next_nonce_h IS NULL
    OR challenge_h=next_nonce_h OR (scope).nonce_h=next_nonce_h OR source_expires_ms IS NULL
    OR session_binding_h IS NULL
    OR contact IS NULL OR channel NOT IN ('email','sms') OR pg_catalog.length(contact) NOT BETWEEN 3 AND 320
    OR contact<>pg_catalog.btrim(contact) OR (channel='email' AND contact<>pg_catalog.lower(contact))
    OR (channel='sms' AND contact !~ '^[+][1-9][0-9]{6,14}$') THEN RETURN false; END IF;
  t:=subtrack_auth.enrollment_checked_ms(scope,'startV2Otp','enroll_identifier',NULL);
  IF t IS NULL OR source_expires_ms<=t OR source_expires_ms>t+300000 THEN RETURN false; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(236::pg_catalog.int4,1::pg_catalog.int4);
  IF (SELECT pg_catalog.count(*) FROM subtrack_auth.otp)>=10000 THEN RETURN false; END IF;
  DELETE FROM subtrack_auth.nonce n WHERE n.nonce_h=(scope).nonce_h AND n.purpose='enroll_identifier'
    AND n.origin=(scope).origin AND n.chain=(scope).chain AND n.binding_h=(scope).binding_h
    AND n.epoch=(scope).epoch AND n.authority_h IS NULL AND n.expires_ms>t;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RETURN false; END IF;
  t:=pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp())*1000::pg_catalog.numeric)::pg_catalog.int8;
  IF t>=source_expires_ms THEN RAISE EXCEPTION USING ERRCODE='22012',MESSAGE='enrollment source expired'; END IF;
  INSERT INTO subtrack_auth.otp(challenge_h,code_h,identifier_h,channel,contact,origin,chain,binding_h,
    session_binding_h,epoch,issued_ms,expires_ms) VALUES (challenge_h,code_h,identifier_h,channel,contact,(scope).origin,
    (scope).chain,(scope).binding_h,session_binding_h,(scope).epoch,t::subtrack_auth.ms,source_expires_ms);
  INSERT INTO subtrack_auth.nonce VALUES (next_nonce_h,'web',(scope).origin,(scope).chain,
    (scope).binding_h,(scope).epoch,t::subtrack_auth.ms,(t+300000)::subtrack_auth.ms,
    'otp_step_up',challenge_h);
  UPDATE subtrack_auth.reservation r SET state='completed' WHERE r.key_h=(scope).key_h AND r.owner_h=(scope).owner_h
    AND r.authority_h=(scope).authority_h AND r.request_h=(scope).request_h AND r.operation='startV2Otp'
    AND r.state='pending';
  RETURN FOUND;
END $issue$;
ALTER FUNCTION subtrack_auth.issue_enrollment_otp(subtrack_auth.enrollment_scope,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,pg_catalog.text,pg_catalog.text,subtrack_auth.h,subtrack_auth.ms,subtrack_auth.h) OWNER TO subtrack_auth_executor;
REVOKE ALL ON FUNCTION subtrack_auth.issue_enrollment_otp(subtrack_auth.enrollment_scope,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,pg_catalog.text,pg_catalog.text,subtrack_auth.h,subtrack_auth.ms,subtrack_auth.h) FROM PUBLIC,st233a_fixture_owner;
GRANT EXECUTE ON FUNCTION subtrack_auth.issue_enrollment_otp(subtrack_auth.enrollment_scope,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,pg_catalog.text,pg_catalog.text,subtrack_auth.h,subtrack_auth.ms,subtrack_auth.h) TO subtrack_auth_producer;

CREATE FUNCTION subtrack_auth.verify_enrollment_otp(scope subtrack_auth.enrollment_scope,
  challenge_h subtrack_auth.h,code_h subtrack_auth.h,proof_h subtrack_auth.h,next_nonce_h subtrack_auth.h)
RETURNS pg_catalog.bool LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
CALLED ON NULL INPUT SET search_path=pg_catalog AS $verify_otp$
DECLARE t pg_catalog.int8; o subtrack_auth.otp%ROWTYPE; changed pg_catalog.int4;
BEGIN
  IF challenge_h IS NULL OR code_h IS NULL OR proof_h IS NULL OR next_nonce_h IS NULL
    OR proof_h=next_nonce_h OR next_nonce_h=(scope).nonce_h THEN RETURN false; END IF;
  t:=subtrack_auth.enrollment_checked_ms(scope,'verifyV2Otp','otp_step_up',challenge_h);
  IF t IS NULL THEN RETURN false; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(236::pg_catalog.int4,2::pg_catalog.int4);
  SELECT x.* INTO o FROM subtrack_auth.otp x WHERE x.challenge_h=verify_enrollment_otp.challenge_h FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  t:=pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp())*1000::pg_catalog.numeric)::pg_catalog.int8;
  IF t<o.issued_ms OR t>=o.expires_ms OR o.attempts>=5 OR o.origin<>(scope).origin
    OR o.chain<>(scope).chain OR o.binding_h<>(scope).binding_h OR o.epoch<>(scope).epoch THEN RETURN false; END IF;
  -- A wrong attempt is intentionally a successful transaction. The caller
  -- commits this false result, including the fifth terminal exhaustion. The
  -- same bound nonce remains usable for attempts 1-4, with a fresh key burn.
  IF o.code_h<>code_h THEN
    UPDATE subtrack_auth.otp x SET attempts=o.attempts+1
      WHERE x.challenge_h=verify_enrollment_otp.challenge_h AND x.attempts=o.attempts;
    IF o.attempts=4 THEN
      DELETE FROM subtrack_auth.nonce n WHERE n.nonce_h=(scope).nonce_h AND n.purpose='otp_step_up'
        AND n.authority_h=verify_enrollment_otp.challenge_h AND n.origin=(scope).origin AND n.chain=(scope).chain
        AND n.binding_h=(scope).binding_h AND n.epoch=(scope).epoch AND n.expires_ms>t;
      GET DIAGNOSTICS changed=ROW_COUNT;
      IF changed<>1 THEN RAISE EXCEPTION USING ERRCODE='22012',MESSAGE='terminal otp exhaustion'; END IF;
    END IF;
    UPDATE subtrack_auth.reservation r SET state='completed' WHERE r.key_h=(scope).key_h AND r.owner_h=(scope).owner_h
      AND r.authority_h=(scope).authority_h AND r.request_h=(scope).request_h AND r.operation='verifyV2Otp' AND r.state='pending';
    RETURN false;
  END IF;
  DELETE FROM subtrack_auth.nonce n WHERE n.nonce_h=(scope).nonce_h AND n.purpose='otp_step_up'
    AND n.authority_h=verify_enrollment_otp.challenge_h AND n.origin=(scope).origin AND n.chain=(scope).chain
    AND n.binding_h=(scope).binding_h AND n.epoch=(scope).epoch AND n.expires_ms>t;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RETURN false; END IF;
  IF (SELECT pg_catalog.count(*) FROM subtrack_auth.restricted_proof)>=10000 THEN
    RAISE EXCEPTION USING ERRCODE='22012',MESSAGE='proof capacity'; END IF;
  INSERT INTO subtrack_auth.restricted_proof VALUES (proof_h,challenge_h,'enrollment',
    (scope).origin,(scope).chain,(scope).binding_h,o.session_binding_h,
    (scope).epoch,t::subtrack_auth.ms,o.expires_ms);
  INSERT INTO subtrack_auth.nonce VALUES (next_nonce_h,'web',(scope).origin,(scope).chain,
    (scope).binding_h,(scope).epoch,t::subtrack_auth.ms,(t+300000)::subtrack_auth.ms,'otp_step_up',proof_h);
  UPDATE subtrack_auth.reservation r SET state='completed' WHERE r.key_h=(scope).key_h AND r.owner_h=(scope).owner_h
    AND r.authority_h=(scope).authority_h AND r.request_h=(scope).request_h AND r.operation='verifyV2Otp' AND r.state='pending';
  RETURN FOUND;
END $verify_otp$;
ALTER FUNCTION subtrack_auth.verify_enrollment_otp(subtrack_auth.enrollment_scope,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h) OWNER TO subtrack_auth_executor;
REVOKE ALL ON FUNCTION subtrack_auth.verify_enrollment_otp(subtrack_auth.enrollment_scope,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h) FROM PUBLIC,st233a_fixture_owner;
GRANT EXECUTE ON FUNCTION subtrack_auth.verify_enrollment_otp(subtrack_auth.enrollment_scope,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h) TO subtrack_auth_producer;

CREATE FUNCTION subtrack_auth.admit_enrollment(scope subtrack_auth.enrollment_scope,
  proof_h subtrack_auth.h,pending_h subtrack_auth.h,next_nonce_h subtrack_auth.h)
RETURNS pg_catalog.bool LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
CALLED ON NULL INPUT SET search_path=pg_catalog AS $admit$
DECLARE t pg_catalog.int8; p subtrack_auth.restricted_proof%ROWTYPE;
  o subtrack_auth.otp%ROWTYPE; changed pg_catalog.int4;
BEGIN
  IF proof_h IS NULL OR pending_h IS NULL OR next_nonce_h IS NULL
    OR pending_h=next_nonce_h OR next_nonce_h=(scope).nonce_h THEN RETURN false; END IF;
  t:=subtrack_auth.enrollment_checked_ms(scope,'admitEnrollment','otp_step_up',proof_h);
  IF t IS NULL THEN RETURN false; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(236::pg_catalog.int4,2::pg_catalog.int4);
  PERFORM pg_catalog.pg_advisory_xact_lock(236::pg_catalog.int4,3::pg_catalog.int4);
  SELECT x.* INTO p FROM subtrack_auth.restricted_proof x WHERE x.proof_h=admit_enrollment.proof_h FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT x.* INTO o FROM subtrack_auth.otp x WHERE x.challenge_h=p.challenge_h;
  t:=pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp())*1000::pg_catalog.numeric)::pg_catalog.int8;
  IF p.purpose<>'enrollment' OR p.origin<>(scope).origin OR p.chain<>(scope).chain
    OR p.binding_h<>(scope).binding_h OR p.epoch<>(scope).epoch OR p.issued_ms>t OR p.expires_ms<=t
    OR o.challenge_h IS NULL OR o.expires_ms<=t OR o.origin<>(scope).origin
    OR o.chain<>(scope).chain OR o.binding_h<>(scope).binding_h OR o.epoch<>(scope).epoch
    OR p.session_binding_h<>o.session_binding_h OR p.expires_ms<>o.expires_ms
    OR p.issued_ms<o.issued_ms THEN RETURN false; END IF;
  IF (SELECT pg_catalog.count(*) FROM subtrack_auth.pending_enrollment)>=10000 THEN RETURN false; END IF;
  DELETE FROM subtrack_auth.nonce n WHERE n.nonce_h=(scope).nonce_h AND n.purpose='otp_step_up'
    AND n.authority_h=admit_enrollment.proof_h AND n.origin=(scope).origin AND n.chain=(scope).chain
    AND n.binding_h=(scope).binding_h AND n.epoch=(scope).epoch AND n.expires_ms>t;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RETURN false; END IF;
  DELETE FROM subtrack_auth.restricted_proof x WHERE x.proof_h=admit_enrollment.proof_h
    AND x.expires_ms>t AND x.purpose='enrollment';
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION USING ERRCODE='22012',MESSAGE='proof consumption'; END IF;
  INSERT INTO subtrack_auth.pending_enrollment VALUES (pending_h,o.challenge_h,o.identifier_h,o.channel,
    o.contact,(scope).origin,(scope).chain,(scope).binding_h,p.session_binding_h,
    (scope).epoch,t::subtrack_auth.ms,p.expires_ms);
  INSERT INTO subtrack_auth.nonce VALUES (next_nonce_h,'web',(scope).origin,(scope).chain,
    (scope).binding_h,(scope).epoch,t::subtrack_auth.ms,(t+300000)::subtrack_auth.ms,
    'otp_step_up',pending_h);
  UPDATE subtrack_auth.reservation r SET state='completed' WHERE r.key_h=(scope).key_h AND r.owner_h=(scope).owner_h
    AND r.authority_h=(scope).authority_h AND r.request_h=(scope).request_h AND r.operation='admitEnrollment' AND r.state='pending';
  RETURN FOUND;
END $admit$;
ALTER FUNCTION subtrack_auth.admit_enrollment(subtrack_auth.enrollment_scope,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h) OWNER TO subtrack_auth_executor;
REVOKE ALL ON FUNCTION subtrack_auth.admit_enrollment(subtrack_auth.enrollment_scope,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h) FROM PUBLIC,st233a_fixture_owner;
GRANT EXECUTE ON FUNCTION subtrack_auth.admit_enrollment(subtrack_auth.enrollment_scope,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h) TO subtrack_runtime;

CREATE FUNCTION subtrack_auth.pending_enrollment(scope subtrack_auth.enrollment_scope,pending_h subtrack_auth.h)
RETURNS pg_catalog.bool LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
CALLED ON NULL INPUT SET search_path=pg_catalog AS $pending$
DECLARE t pg_catalog.int8; p subtrack_auth.pending_enrollment%ROWTYPE;
BEGIN
  IF pending_h IS NULL THEN RETURN false; END IF;
  t:=subtrack_auth.enrollment_checked_ms(scope,'verifyEnrollmentPerson','otp_step_up',pending_h);
  IF t IS NULL THEN RETURN false; END IF;
  SELECT x.* INTO p FROM subtrack_auth.pending_enrollment x WHERE x.pending_h=pending_enrollment.pending_h;
  t:=pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp())*1000::pg_catalog.numeric)::pg_catalog.int8;
  RETURN p.pending_h IS NOT NULL AND p.origin=(scope).origin AND p.chain=(scope).chain
    AND p.binding_h=(scope).binding_h AND p.epoch=(scope).epoch AND p.issued_ms<=t AND t<p.expires_ms
    AND EXISTS (SELECT 1 FROM subtrack_auth.otp o WHERE o.challenge_h=p.challenge_h AND o.expires_ms>t
      AND o.origin=(scope).origin AND o.chain=(scope).chain AND o.binding_h=(scope).binding_h
      AND o.epoch=(scope).epoch AND o.session_binding_h=p.session_binding_h
      AND o.expires_ms=p.expires_ms);
END $pending$;
ALTER FUNCTION subtrack_auth.pending_enrollment(subtrack_auth.enrollment_scope,subtrack_auth.h) OWNER TO subtrack_auth_executor;
REVOKE ALL ON FUNCTION subtrack_auth.pending_enrollment(subtrack_auth.enrollment_scope,subtrack_auth.h) FROM PUBLIC,st233a_fixture_owner;
GRANT EXECUTE ON FUNCTION subtrack_auth.pending_enrollment(subtrack_auth.enrollment_scope,subtrack_auth.h) TO subtrack_auth_producer;

CREATE FUNCTION subtrack_auth.verify_enrollment_person(scope subtrack_auth.enrollment_scope,
  pending_h subtrack_auth.h,verified_h subtrack_auth.h,terminal_nonce_h subtrack_auth.h,
  subject_h subtrack_auth.h,verified_at pg_catalog.text,given_name pg_catalog.text,surname pg_catalog.text)
RETURNS pg_catalog.bool LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
CALLED ON NULL INPUT SET search_path=pg_catalog AS $verify_person$
DECLARE t pg_catalog.int8; p subtrack_auth.pending_enrollment%ROWTYPE; changed pg_catalog.int4;
  at_time pg_catalog.timestamptz;
BEGIN
  IF pending_h IS NULL OR verified_h IS NULL OR terminal_nonce_h IS NULL OR subject_h IS NULL
    OR verified_h=terminal_nonce_h OR terminal_nonce_h=(scope).nonce_h
    OR verified_at IS NULL OR verified_at !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
    OR given_name IS NULL OR pg_catalog.length(given_name) NOT BETWEEN 1 AND 120
    OR surname IS NULL OR pg_catalog.length(surname) NOT BETWEEN 1 AND 120 THEN RETURN false; END IF;
  at_time:=verified_at::pg_catalog.timestamptz;
  t:=subtrack_auth.enrollment_checked_ms(scope,'verifyEnrollmentPerson','otp_step_up',pending_h);
  IF t IS NULL THEN RETURN false; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(236::pg_catalog.int4,3::pg_catalog.int4);
  PERFORM pg_catalog.pg_advisory_xact_lock(236::pg_catalog.int4,4::pg_catalog.int4);
  SELECT x.* INTO p FROM subtrack_auth.pending_enrollment x
    WHERE x.pending_h=verify_enrollment_person.pending_h FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  t:=pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp())*1000::pg_catalog.numeric)::pg_catalog.int8;
  IF p.origin<>(scope).origin OR p.chain<>(scope).chain OR p.binding_h<>(scope).binding_h
    OR p.epoch<>(scope).epoch OR p.issued_ms>t OR p.expires_ms<=t
    OR at_time>pg_catalog.clock_timestamp() OR at_time<pg_catalog.to_timestamp((t-300000)/1000.0)
    OR NOT EXISTS (SELECT 1 FROM subtrack_auth.otp o WHERE o.challenge_h=p.challenge_h
      AND o.expires_ms>t AND o.origin=(scope).origin AND o.chain=(scope).chain
      AND o.binding_h=(scope).binding_h AND o.epoch=(scope).epoch
      AND o.session_binding_h=p.session_binding_h AND o.expires_ms=p.expires_ms)
    THEN RETURN false; END IF;
  IF (SELECT pg_catalog.count(*) FROM subtrack_auth.verified_enrollment)>=10000 THEN RETURN false; END IF;
  DELETE FROM subtrack_auth.nonce n WHERE n.nonce_h=(scope).nonce_h AND n.purpose='otp_step_up'
    AND n.authority_h=verify_enrollment_person.pending_h AND n.origin=(scope).origin AND n.chain=(scope).chain
    AND n.binding_h=(scope).binding_h AND n.epoch=(scope).epoch AND n.expires_ms>t;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RETURN false; END IF;
  DELETE FROM subtrack_auth.pending_enrollment x WHERE x.pending_h=verify_enrollment_person.pending_h
    AND x.expires_ms>t;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION USING ERRCODE='22012',MESSAGE='pending consumption'; END IF;
  INSERT INTO subtrack_auth.nonce VALUES (terminal_nonce_h,'web',(scope).origin,(scope).chain,
    (scope).binding_h,(scope).epoch,t::subtrack_auth.ms,(t+300000)::subtrack_auth.ms,'session',verified_h);
  INSERT INTO subtrack_auth.verified_enrollment VALUES (verified_h,pending_h,subject_h,p.channel,p.contact,
    verified_at,given_name,surname,terminal_nonce_h,NULL,(scope).origin,(scope).chain,
    (scope).binding_h,p.session_binding_h,(scope).epoch,t::subtrack_auth.ms,p.expires_ms);
  UPDATE subtrack_auth.reservation r SET state='completed' WHERE r.key_h=(scope).key_h AND r.owner_h=(scope).owner_h
    AND r.authority_h=(scope).authority_h AND r.request_h=(scope).request_h
    AND r.operation='verifyEnrollmentPerson' AND r.state='pending';
  RETURN FOUND;
END $verify_person$;
ALTER FUNCTION subtrack_auth.verify_enrollment_person(subtrack_auth.enrollment_scope,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,pg_catalog.text,pg_catalog.text,pg_catalog.text) OWNER TO subtrack_auth_executor;
REVOKE ALL ON FUNCTION subtrack_auth.verify_enrollment_person(subtrack_auth.enrollment_scope,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,pg_catalog.text,pg_catalog.text,pg_catalog.text) FROM PUBLIC,st233a_fixture_owner;
GRANT EXECUTE ON FUNCTION subtrack_auth.verify_enrollment_person(subtrack_auth.enrollment_scope,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,subtrack_auth.h,pg_catalog.text,pg_catalog.text,pg_catalog.text) TO subtrack_auth_producer;

-- This fixed material return is available only while the terminal burn and
-- one-use verified+session nonce are owned and locked by the same transaction.
CREATE FUNCTION subtrack_auth.terminal_enrollment(scope subtrack_auth.enrollment_scope,
  verified_h subtrack_auth.h,terminal_nonce_h subtrack_auth.h)
RETURNS TABLE(subject_h subtrack_auth.h,channel pg_catalog.text,contact pg_catalog.text,
  verified_at pg_catalog.text,given_name pg_catalog.text,surname pg_catalog.text)
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
CALLED ON NULL INPUT SET search_path=pg_catalog AS $terminal$
DECLARE t pg_catalog.int8; v subtrack_auth.verified_enrollment%ROWTYPE;
BEGIN
  IF verified_h IS NULL OR terminal_nonce_h IS NULL OR (scope).nonce_h<>terminal_nonce_h THEN RETURN; END IF;
  t:=subtrack_auth.enrollment_checked_ms(scope,'completeEnrollment','session',verified_h);
  IF t IS NULL THEN RETURN; END IF;
  SELECT x.* INTO v FROM subtrack_auth.verified_enrollment x
    WHERE x.verified_h=terminal_enrollment.verified_h FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  t:=pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp())*1000::pg_catalog.numeric)::pg_catalog.int8;
  IF v.terminal_nonce_h<>terminal_nonce_h OR v.identity_id IS NOT NULL
    OR v.origin<>(scope).origin OR v.chain<>(scope).chain OR v.binding_h<>(scope).binding_h
    OR v.epoch<>(scope).epoch OR v.issued_ms>t OR v.expires_ms<=t THEN RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(236::pg_catalog.int4,5::pg_catalog.int4);
  IF (SELECT pg_catalog.count(*) FROM subtrack_auth.enrollment_intent)>=10000 THEN RETURN; END IF;
  INSERT INTO subtrack_auth.enrollment_intent(xid,verified_h,expires_ms)
    VALUES (pg_catalog.pg_current_xact_id(),v.verified_h,v.expires_ms)
    ON CONFLICT (xid,verified_h) DO NOTHING;
  RETURN QUERY SELECT v.subject_h,v.channel,v.contact,v.verified_at,v.given_name,v.surname;
END $terminal$;
ALTER FUNCTION subtrack_auth.terminal_enrollment(subtrack_auth.enrollment_scope,subtrack_auth.h,subtrack_auth.h) OWNER TO subtrack_auth_executor;
REVOKE ALL ON FUNCTION subtrack_auth.terminal_enrollment(subtrack_auth.enrollment_scope,subtrack_auth.h,subtrack_auth.h) FROM PUBLIC,st233a_fixture_owner;
GRANT EXECUTE ON FUNCTION subtrack_auth.terminal_enrollment(subtrack_auth.enrollment_scope,subtrack_auth.h,subtrack_auth.h) TO subtrack_runtime;

CREATE FUNCTION subtrack_auth.bind_enrollment_identity(scope subtrack_auth.enrollment_scope,
  verified_h subtrack_auth.h,terminal_nonce_h subtrack_auth.h,identity_id pg_catalog.uuid)
RETURNS pg_catalog.bool LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
CALLED ON NULL INPUT SET search_path=pg_catalog AS $bind$
DECLARE t pg_catalog.int8; v subtrack_auth.verified_enrollment%ROWTYPE;
  i_subject pg_catalog.text; i_deleted pg_catalog.timestamptz;
BEGIN
  IF verified_h IS NULL OR terminal_nonce_h IS NULL OR identity_id IS NULL
    OR identity_id='00000000-0000-0000-0000-000000000000'::pg_catalog.uuid
    OR (scope).nonce_h<>terminal_nonce_h
    OR pg_catalog.current_setting('app.user_id',true) IS DISTINCT FROM identity_id::pg_catalog.text
    OR pg_catalog.current_setting('app.current_user_id',true) IS DISTINCT FROM identity_id::pg_catalog.text
    THEN RETURN false; END IF;
  t:=subtrack_auth.enrollment_checked_ms(scope,'completeEnrollment','session',verified_h);
  IF t IS NULL THEN RETURN false; END IF;
  SELECT x.* INTO v FROM subtrack_auth.verified_enrollment x
    WHERE x.verified_h=bind_enrollment_identity.verified_h FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  t:=pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp())*1000::pg_catalog.numeric)::pg_catalog.int8;
  IF v.identity_id IS NOT NULL OR v.terminal_nonce_h<>terminal_nonce_h OR v.origin<>(scope).origin
    OR v.chain<>(scope).chain OR v.binding_h<>(scope).binding_h OR v.epoch<>(scope).epoch
    OR v.issued_ms>t OR v.expires_ms<=t THEN RETURN false; END IF;
  -- Runtime already holds this live row lock. The private birth record proves
  -- that the qualified provisioner inserted this exact UUID in this xid.
  SELECT i.external_id,i.deleted_at
    INTO i_subject,i_deleted FROM public.identity i WHERE i.id=bind_enrollment_identity.identity_id;
  IF NOT FOUND OR i_deleted IS NOT NULL OR i_subject IS DISTINCT FROM v.subject_h::pg_catalog.text
    OR NOT EXISTS (SELECT 1 FROM subtrack_auth.enrollment_intent a
      WHERE a.xid=pg_catalog.pg_current_xact_id() AND a.verified_h=v.verified_h AND a.expires_ms>t)
    OR NOT EXISTS (SELECT 1 FROM subtrack_auth.identity_birth b
      WHERE b.identity_id=bind_enrollment_identity.identity_id
        AND b.xid=pg_catalog.pg_current_xact_id())
    THEN RETURN false; END IF;
  UPDATE subtrack_auth.verified_enrollment x SET identity_id=bind_enrollment_identity.identity_id
    WHERE x.verified_h=bind_enrollment_identity.verified_h AND x.identity_id IS NULL;
  RETURN FOUND;
END $bind$;
ALTER FUNCTION subtrack_auth.bind_enrollment_identity(subtrack_auth.enrollment_scope,subtrack_auth.h,subtrack_auth.h,pg_catalog.uuid) OWNER TO subtrack_auth_executor;
REVOKE ALL ON FUNCTION subtrack_auth.bind_enrollment_identity(subtrack_auth.enrollment_scope,subtrack_auth.h,subtrack_auth.h,pg_catalog.uuid) FROM PUBLIC,st233a_fixture_owner;
GRANT EXECUTE ON FUNCTION subtrack_auth.bind_enrollment_identity(subtrack_auth.enrollment_scope,subtrack_auth.h,subtrack_auth.h,pg_catalog.uuid) TO subtrack_runtime;

CREATE FUNCTION subtrack_auth.issue_enrollment_session(scope subtrack_auth.enrollment_scope,
  verified_h subtrack_auth.h,terminal_nonce_h subtrack_auth.h,identity_id pg_catalog.uuid,
  sid pg_catalog.uuid,fid pg_catalog.uuid,refresh_h subtrack_auth.h,csrf_h subtrack_auth.h)
RETURNS pg_catalog.bool LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
CALLED ON NULL INPUT SET search_path=pg_catalog AS $session$
DECLARE t pg_catalog.int8; v subtrack_auth.verified_enrollment%ROWTYPE;
BEGIN
  IF verified_h IS NULL OR terminal_nonce_h IS NULL OR identity_id IS NULL OR sid IS NULL OR fid IS NULL
    OR sid=fid OR refresh_h IS NULL OR csrf_h IS NULL OR refresh_h=csrf_h
    OR (scope).nonce_h<>terminal_nonce_h
    OR pg_catalog.current_setting('app.user_id',true) IS DISTINCT FROM identity_id::pg_catalog.text
    OR pg_catalog.current_setting('app.current_user_id',true) IS DISTINCT FROM identity_id::pg_catalog.text
    THEN RETURN false; END IF;
  t:=subtrack_auth.enrollment_checked_ms(scope,'completeEnrollment','session',verified_h);
  IF t IS NULL THEN RETURN false; END IF;
  SELECT x.* INTO v FROM subtrack_auth.verified_enrollment x
    WHERE x.verified_h=issue_enrollment_session.verified_h FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  t:=pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp())*1000::pg_catalog.numeric)::pg_catalog.int8;
  IF v.identity_id IS DISTINCT FROM identity_id OR v.terminal_nonce_h<>terminal_nonce_h
    OR v.origin<>(scope).origin OR v.chain<>(scope).chain OR v.binding_h<>(scope).binding_h
    OR v.epoch<>(scope).epoch OR v.issued_ms>t OR v.expires_ms<=t
    OR EXISTS (SELECT 1 FROM subtrack_auth.session s
      WHERE s.identity_id=issue_enrollment_session.identity_id) THEN RETURN false; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(235::pg_catalog.int4,1::pg_catalog.int4);
  IF (SELECT pg_catalog.count(*) FROM subtrack_auth.session)>=10000 THEN RETURN false; END IF;
  INSERT INTO subtrack_auth.family VALUES (fid,identity_id,(scope).epoch,
    t::subtrack_auth.ms,(t+86400000)::subtrack_auth.ms,NULL);
  INSERT INTO subtrack_auth.session VALUES (sid,fid,identity_id,'web',(scope).origin,(scope).chain,
    v.session_binding_h,(scope).epoch,t::subtrack_auth.ms,(t+86400000)::subtrack_auth.ms,NULL);
  INSERT INTO subtrack_auth.credential VALUES (refresh_h,sid,fid,identity_id,(scope).epoch,'current',
    t::subtrack_auth.ms,(t+86400000)::subtrack_auth.ms);
  INSERT INTO subtrack_auth.csrf VALUES (sid,fid,identity_id,(scope).epoch,csrf_h,
    t::subtrack_auth.ms,(t+86400000)::subtrack_auth.ms);
  RETURN true;
END $session$;
ALTER FUNCTION subtrack_auth.issue_enrollment_session(subtrack_auth.enrollment_scope,subtrack_auth.h,subtrack_auth.h,pg_catalog.uuid,pg_catalog.uuid,pg_catalog.uuid,subtrack_auth.h,subtrack_auth.h) OWNER TO subtrack_auth_executor;
REVOKE ALL ON FUNCTION subtrack_auth.issue_enrollment_session(subtrack_auth.enrollment_scope,subtrack_auth.h,subtrack_auth.h,pg_catalog.uuid,pg_catalog.uuid,pg_catalog.uuid,subtrack_auth.h,subtrack_auth.h) FROM PUBLIC,st233a_fixture_owner;
GRANT EXECUTE ON FUNCTION subtrack_auth.issue_enrollment_session(subtrack_auth.enrollment_scope,subtrack_auth.h,subtrack_auth.h,pg_catalog.uuid,pg_catalog.uuid,pg_catalog.uuid,subtrack_auth.h,subtrack_auth.h) TO subtrack_runtime;

CREATE FUNCTION subtrack_auth.consume_enrollment(scope subtrack_auth.enrollment_scope,
  verified_h subtrack_auth.h,terminal_nonce_h subtrack_auth.h)
RETURNS pg_catalog.bool LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
CALLED ON NULL INPUT SET search_path=pg_catalog AS $consume$
DECLARE t pg_catalog.int8; v subtrack_auth.verified_enrollment%ROWTYPE; changed pg_catalog.int4;
BEGIN
  IF verified_h IS NULL OR terminal_nonce_h IS NULL OR (scope).nonce_h<>terminal_nonce_h THEN RETURN false; END IF;
  t:=subtrack_auth.enrollment_checked_ms(scope,'completeEnrollment','session',verified_h);
  IF t IS NULL THEN RETURN false; END IF;
  SELECT x.* INTO v FROM subtrack_auth.verified_enrollment x
    WHERE x.verified_h=consume_enrollment.verified_h FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  t:=pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp())*1000::pg_catalog.numeric)::pg_catalog.int8;
  IF v.identity_id IS NULL OR v.terminal_nonce_h<>terminal_nonce_h OR v.origin<>(scope).origin
    OR v.chain<>(scope).chain OR v.binding_h<>(scope).binding_h OR v.epoch<>(scope).epoch
    OR v.issued_ms>t OR v.expires_ms<=t
    OR pg_catalog.current_setting('app.user_id',true) IS DISTINCT FROM v.identity_id::pg_catalog.text
    OR pg_catalog.current_setting('app.current_user_id',true) IS DISTINCT FROM v.identity_id::pg_catalog.text
    OR NOT EXISTS (SELECT 1 FROM subtrack_auth.enrollment_intent a
      WHERE a.xid=pg_catalog.pg_current_xact_id() AND a.verified_h=v.verified_h AND a.expires_ms>t)
    OR NOT EXISTS (SELECT 1 FROM subtrack_auth.identity_birth b
      WHERE b.identity_id=v.identity_id AND b.xid=pg_catalog.pg_current_xact_id())
    OR NOT EXISTS (SELECT 1 FROM subtrack_auth.session s JOIN subtrack_auth.family f
      ON f.family_id=s.family_id AND f.identity_id=s.identity_id AND f.epoch=s.epoch
      JOIN subtrack_auth.credential c ON c.session_id=s.session_id AND c.identity_id=s.identity_id
      JOIN subtrack_auth.csrf x ON x.session_id=s.session_id AND x.identity_id=s.identity_id
      WHERE s.identity_id=v.identity_id AND s.epoch=(scope).epoch AND s.chain=(scope).chain
      AND s.binding_h=v.session_binding_h AND s.origin=(scope).origin AND s.revoked_ms IS NULL)
    THEN RETURN false; END IF;
  DELETE FROM subtrack_auth.verified_enrollment x WHERE x.verified_h=consume_enrollment.verified_h
    AND x.identity_id=v.identity_id AND x.expires_ms>t;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RETURN false; END IF;
  DELETE FROM subtrack_auth.nonce n WHERE n.nonce_h=consume_enrollment.terminal_nonce_h
    AND n.authority_h=consume_enrollment.verified_h
    AND n.purpose='session' AND n.origin=(scope).origin AND n.chain=(scope).chain
    AND n.binding_h=(scope).binding_h AND n.epoch=(scope).epoch AND n.expires_ms>t;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION USING ERRCODE='22012',MESSAGE='terminal nonce consumption'; END IF;
  DELETE FROM subtrack_auth.identity_birth b WHERE b.identity_id=v.identity_id
    AND b.xid=pg_catalog.pg_current_xact_id();
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION USING ERRCODE='22012',MESSAGE='birth consumption'; END IF;
  DELETE FROM subtrack_auth.enrollment_intent a WHERE a.xid=pg_catalog.pg_current_xact_id()
    AND a.verified_h=v.verified_h;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION USING ERRCODE='22012',MESSAGE='intent consumption'; END IF;
  UPDATE subtrack_auth.reservation r SET state='completed' WHERE r.key_h=(scope).key_h AND r.owner_h=(scope).owner_h
    AND r.authority_h=(scope).authority_h AND r.request_h=(scope).request_h
    AND r.operation='completeEnrollment' AND r.state='pending';
  RETURN FOUND;
END $consume$;
ALTER FUNCTION subtrack_auth.consume_enrollment(subtrack_auth.enrollment_scope,subtrack_auth.h,subtrack_auth.h) OWNER TO subtrack_auth_executor;
REVOKE ALL ON FUNCTION subtrack_auth.consume_enrollment(subtrack_auth.enrollment_scope,subtrack_auth.h,subtrack_auth.h) FROM PUBLIC,st233a_fixture_owner;
GRANT EXECUTE ON FUNCTION subtrack_auth.consume_enrollment(subtrack_auth.enrollment_scope,subtrack_auth.h,subtrack_auth.h) TO subtrack_runtime;

-- A known rollback may mark only the independently committed owned burn.
-- It never removes the key, returns material or makes a failed result reusable.
CREATE FUNCTION subtrack_auth.fail_enrollment_burn(scope subtrack_auth.enrollment_scope)
RETURNS pg_catalog.bool LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
CALLED ON NULL INPUT SET search_path=pg_catalog AS $fail$
DECLARE e subtrack_auth.epoch%ROWTYPE; t pg_catalog.int8; changed pg_catalog.int4;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation')<>'read committed'
    OR scope IS NULL OR (scope).key_h IS NULL OR (scope).owner_h IS NULL
    OR (scope).authority_h IS NULL OR (scope).request_h IS NULL OR (scope).origin IS NULL
    OR (scope).origin<>'https://st233a.invalid' OR (scope).epoch IS NULL
    OR (scope).manifest_h IS NULL OR (scope).observed_ms IS NULL THEN RETURN false; END IF;
  SELECT x.* INTO e FROM subtrack_auth.epoch x WHERE x.id=(scope).epoch FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  t:=pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp())*1000::pg_catalog.numeric)::pg_catalog.int8;
  IF e.manifest_h<>(scope).manifest_h OR e.origin<>(scope).origin OR (scope).observed_ms>t
    OR t<e.watermark_ms THEN RETURN false; END IF;
  UPDATE subtrack_auth.reservation r SET state='failed' WHERE r.key_h=(scope).key_h
    AND r.owner_h=(scope).owner_h AND r.authority_h=(scope).authority_h
    AND r.request_h=(scope).request_h AND r.epoch=(scope).epoch
    AND r.operation IN ('startV2Otp','verifyV2Otp','admitEnrollment','verifyEnrollmentPerson','completeEnrollment')
    AND r.authority_kind='enrollment-chain' AND r.transport='web' AND r.state='pending';
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN changed=1;
END $fail$;
ALTER FUNCTION subtrack_auth.fail_enrollment_burn(subtrack_auth.enrollment_scope) OWNER TO subtrack_auth_executor;
REVOKE ALL ON FUNCTION subtrack_auth.fail_enrollment_burn(subtrack_auth.enrollment_scope) FROM PUBLIC,st233a_fixture_owner;
GRANT EXECUTE ON FUNCTION subtrack_auth.fail_enrollment_burn(subtrack_auth.enrollment_scope) TO subtrack_runtime,subtrack_auth_producer;

-- Expiry-only private state cleanup. Existing reservation/nonce pruners retain
-- their own global custody; this function cannot evict a live source or burn.
CREATE FUNCTION subtrack_auth.prune_enrollment(epoch pg_catalog.text,manifest_h subtrack_auth.h,
  observed_ms subtrack_auth.ms)
RETURNS pg_catalog.bool LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
CALLED ON NULL INPUT SET search_path=pg_catalog AS $prune$
DECLARE e subtrack_auth.epoch%ROWTYPE; t pg_catalog.int8;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation')<>'read committed'
    OR epoch IS NULL OR epoch='' OR manifest_h IS NULL OR observed_ms IS NULL THEN RETURN false; END IF;
  SELECT x.* INTO e FROM subtrack_auth.epoch x WHERE x.id=prune_enrollment.epoch FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  t:=pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp())*1000::pg_catalog.numeric)::pg_catalog.int8;
  IF t<0 OR t>9007199254740991 OR t<e.watermark_ms OR observed_ms>t
    OR e.state<>'active' OR e.manifest_h<>manifest_h OR e.origin<>'https://st233a.invalid' THEN RETURN false; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(236::pg_catalog.int4,1::pg_catalog.int4);
  PERFORM pg_catalog.pg_advisory_xact_lock(236::pg_catalog.int4,2::pg_catalog.int4);
  PERFORM pg_catalog.pg_advisory_xact_lock(236::pg_catalog.int4,3::pg_catalog.int4);
  PERFORM pg_catalog.pg_advisory_xact_lock(236::pg_catalog.int4,4::pg_catalog.int4);
  PERFORM pg_catalog.pg_advisory_xact_lock(236::pg_catalog.int4,5::pg_catalog.int4);
  t:=pg_catalog.floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp())*1000::pg_catalog.numeric)::pg_catalog.int8;
  DELETE FROM subtrack_auth.identity_birth b WHERE NOT EXISTS
    (SELECT 1 FROM subtrack_auth.enrollment_intent a WHERE a.xid=b.xid AND a.expires_ms>t);
  DELETE FROM subtrack_auth.enrollment_intent a WHERE a.expires_ms<=t;
  DELETE FROM subtrack_auth.verified_enrollment x WHERE x.epoch=prune_enrollment.epoch AND x.expires_ms<=t;
  DELETE FROM subtrack_auth.pending_enrollment x WHERE x.epoch=prune_enrollment.epoch AND x.expires_ms<=t;
  DELETE FROM subtrack_auth.restricted_proof x WHERE x.epoch=prune_enrollment.epoch AND x.expires_ms<=t;
  DELETE FROM subtrack_auth.otp x WHERE x.epoch=prune_enrollment.epoch AND x.expires_ms<=t
    AND NOT EXISTS (SELECT 1 FROM subtrack_auth.restricted_proof p WHERE p.challenge_h=x.challenge_h)
    AND NOT EXISTS (SELECT 1 FROM subtrack_auth.pending_enrollment p WHERE p.challenge_h=x.challenge_h);
  RETURN true;
END $prune$;
ALTER FUNCTION subtrack_auth.prune_enrollment(pg_catalog.text,subtrack_auth.h,subtrack_auth.ms) OWNER TO subtrack_auth_executor;
REVOKE ALL ON FUNCTION subtrack_auth.prune_enrollment(pg_catalog.text,subtrack_auth.h,subtrack_auth.ms) FROM PUBLIC,st233a_fixture_owner;
GRANT EXECUTE ON FUNCTION subtrack_auth.prune_enrollment(pg_catalog.text,subtrack_auth.h,subtrack_auth.ms) TO subtrack_runtime,subtrack_auth_producer;
COMMIT;
