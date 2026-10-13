-- ST244 additive qualified private mobile namespace; existing web SQL remains unchanged.
BEGIN;
SET LOCAL search_path=pg_catalog;
SELECT 1/(pg_catalog.current_database()='st237_private_https_profile'
 AND SESSION_USER='st233a_fixture_owner'
 AND pg_catalog.current_setting('server_version_num')::int4 BETWEEN 160000 AND 169999
 AND EXISTS(SELECT 1 FROM public.st233a_fixture_control WHERE task='ST-233a'
 AND head=pg_catalog.current_setting('st233a.head') AND marker=pg_catalog.current_setting('st233a.marker')))::int4;
CREATE SCHEMA st244_mobile AUTHORIZATION subtrack_auth_owner;
REVOKE ALL ON SCHEMA st244_mobile FROM PUBLIC;
GRANT USAGE ON SCHEMA st244_mobile TO subtrack_runtime,subtrack_auth_producer;
CREATE TABLE st244_mobile.epoch(
 id text PRIMARY KEY CHECK(id='st244-mobile-private-v1'),manifest_h text NOT NULL CHECK(manifest_h~'^[a-f0-9]{64}$'),
 watermark_ms bigint NOT NULL CHECK(watermark_ms>=0),active boolean NOT NULL);
CREATE TABLE st244_mobile.reservation(
 key_h text PRIMARY KEY CHECK(key_h~'^[a-f0-9]{64}$'),authority_h text NOT NULL CHECK(authority_h~'^[a-f0-9]{64}$'),
 request_h text NOT NULL CHECK(request_h~'^[a-f0-9]{64}$'),operation text NOT NULL CHECK(operation IN('complete-enrollment','verify-login','create-session','refresh')),
 authority_kind text NOT NULL CHECK(authority_kind IN('verified-mobile-subject','verified-mobile-principal')),
 epoch text NOT NULL REFERENCES st244_mobile.epoch(id),manifest_h text NOT NULL CHECK(manifest_h~'^[a-f0-9]{64}$'),
 verified_ms bigint NOT NULL CHECK(verified_ms>=0),expires_ms bigint NOT NULL CHECK(expires_ms>verified_ms),
 CHECK((operation='refresh')=(authority_kind='verified-mobile-principal')));
CREATE TABLE st244_mobile.login_proof(
 proof_h text PRIMARY KEY CHECK(proof_h~'^[a-f0-9]{64}$'),identity_id uuid NOT NULL REFERENCES public.identity(id) ON DELETE CASCADE,
 subject_h text NOT NULL CHECK(subject_h~'^[a-f0-9]{64}$'),authority_h text NOT NULL CHECK(authority_h~'^[a-f0-9]{64}$'),
 epoch text NOT NULL REFERENCES st244_mobile.epoch(id),manifest_h text NOT NULL CHECK(manifest_h~'^[a-f0-9]{64}$'),
 verified_ms bigint NOT NULL CHECK(verified_ms>=0),expires_ms bigint NOT NULL CHECK(expires_ms=verified_ms+300000));
CREATE TABLE st244_mobile.verified_contact(
 identity_id uuid PRIMARY KEY REFERENCES public.identity(id) ON DELETE CASCADE,
 identifier_h text NOT NULL CHECK(identifier_h~'^[a-f0-9]{64}$'),channel text NOT NULL CHECK(channel IN('sms','email')),
 UNIQUE(identifier_h,channel));
CREATE TABLE st244_mobile.session(
 id uuid PRIMARY KEY,identity_id uuid NOT NULL REFERENCES public.identity(id) ON DELETE CASCADE,family_id uuid NOT NULL UNIQUE,
 generation bigint NOT NULL DEFAULT 0 CHECK(generation>=0),refresh_h text NOT NULL UNIQUE CHECK(refresh_h~'^[a-f0-9]{64}$'),
 created_ms bigint NOT NULL CHECK(created_ms>=0),expires_ms bigint NOT NULL CHECK(expires_ms=created_ms+86400000),
 revoked_ms bigint CHECK(revoked_ms>=created_ms),CHECK(id<>family_id));
CREATE TABLE st244_mobile.consumed_refresh(
 refresh_h text PRIMARY KEY CHECK(refresh_h~'^[a-f0-9]{64}$'),session_id uuid NOT NULL REFERENCES st244_mobile.session(id) ON DELETE CASCADE,
 identity_id uuid NOT NULL REFERENCES public.identity(id) ON DELETE CASCADE,expires_ms bigint NOT NULL CHECK(expires_ms>=0));
INSERT INTO st244_mobile.epoch VALUES('st244-mobile-private-v1',pg_catalog.current_setting('st244.manifest'),0,true);
ALTER TABLE st244_mobile.epoch OWNER TO subtrack_auth_owner;
ALTER TABLE st244_mobile.reservation OWNER TO subtrack_auth_owner;
ALTER TABLE st244_mobile.login_proof OWNER TO subtrack_auth_owner;
ALTER TABLE st244_mobile.verified_contact OWNER TO subtrack_auth_owner;
ALTER TABLE st244_mobile.session OWNER TO subtrack_auth_owner;
ALTER TABLE st244_mobile.consumed_refresh OWNER TO subtrack_auth_owner;
ALTER TABLE st244_mobile.epoch ENABLE ROW LEVEL SECURITY;ALTER TABLE st244_mobile.epoch FORCE ROW LEVEL SECURITY;
ALTER TABLE st244_mobile.reservation ENABLE ROW LEVEL SECURITY;ALTER TABLE st244_mobile.reservation FORCE ROW LEVEL SECURITY;
ALTER TABLE st244_mobile.login_proof ENABLE ROW LEVEL SECURITY;ALTER TABLE st244_mobile.login_proof FORCE ROW LEVEL SECURITY;
ALTER TABLE st244_mobile.verified_contact ENABLE ROW LEVEL SECURITY;ALTER TABLE st244_mobile.verified_contact FORCE ROW LEVEL SECURITY;
ALTER TABLE st244_mobile.session ENABLE ROW LEVEL SECURITY;ALTER TABLE st244_mobile.session FORCE ROW LEVEL SECURITY;
ALTER TABLE st244_mobile.consumed_refresh ENABLE ROW LEVEL SECURITY;ALTER TABLE st244_mobile.consumed_refresh FORCE ROW LEVEL SECURITY;
CREATE POLICY epoch_read ON st244_mobile.epoch FOR SELECT TO subtrack_runtime,subtrack_auth_producer USING(true);
CREATE POLICY epoch_watermark ON st244_mobile.epoch FOR UPDATE TO subtrack_runtime,subtrack_auth_producer USING(true) WITH CHECK(true);
CREATE POLICY reserve_producer ON st244_mobile.reservation TO subtrack_auth_producer USING(true) WITH CHECK(true);
CREATE POLICY proof_producer ON st244_mobile.login_proof TO subtrack_auth_producer USING(true) WITH CHECK(true);
CREATE POLICY contact_owner ON st244_mobile.verified_contact FOR INSERT TO subtrack_runtime WITH CHECK(public.subtrack_principal_matches(identity_id));
CREATE POLICY session_producer ON st244_mobile.session TO subtrack_auth_producer USING(true) WITH CHECK(true);
CREATE POLICY consumed_producer ON st244_mobile.consumed_refresh TO subtrack_auth_producer USING(true) WITH CHECK(true);
CREATE POLICY session_owner ON st244_mobile.session TO subtrack_runtime
 USING(public.subtrack_principal_matches(identity_id)) WITH CHECK(public.subtrack_principal_matches(identity_id));
GRANT SELECT ON st244_mobile.epoch TO subtrack_runtime,subtrack_auth_producer;
GRANT UPDATE(watermark_ms) ON st244_mobile.epoch TO subtrack_runtime,subtrack_auth_producer;
GRANT SELECT,INSERT,DELETE ON st244_mobile.reservation,st244_mobile.login_proof,st244_mobile.consumed_refresh TO subtrack_auth_producer;
GRANT INSERT ON st244_mobile.verified_contact TO subtrack_runtime;
GRANT SELECT,INSERT,DELETE ON st244_mobile.session TO subtrack_auth_producer;
GRANT UPDATE(refresh_h,generation,revoked_ms) ON st244_mobile.session TO subtrack_auth_producer;
GRANT SELECT,INSERT ON st244_mobile.session TO subtrack_runtime;
GRANT UPDATE(revoked_ms) ON st244_mobile.session TO subtrack_runtime;
COMMIT;
