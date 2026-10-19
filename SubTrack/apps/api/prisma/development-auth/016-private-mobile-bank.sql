BEGIN;
SET LOCAL search_path=pg_catalog;
SELECT 1/(pg_catalog.current_database()='st237_private_https_profile'
 AND SESSION_USER='st233a_fixture_owner'
 AND pg_catalog.current_setting('server_version_num')::int4 BETWEEN 160000 AND 169999
 AND EXISTS(SELECT 1 FROM public.st233a_fixture_control WHERE task='ST-233a'
 AND head=pg_catalog.current_setting('st233a.head') AND marker=pg_catalog.current_setting('st233a.marker')))::int4;
CREATE SCHEMA st248_bank AUTHORIZATION subtrack_auth_owner;
REVOKE ALL ON SCHEMA st248_bank FROM PUBLIC;
GRANT USAGE ON SCHEMA st248_bank TO subtrack_runtime;
CREATE TABLE st248_bank.generation (
 connection_id uuid PRIMARY KEY, identity_id uuid NOT NULL,
 fixture_version text NOT NULL CHECK(fixture_version='solberg-v1'),
 purged_at timestamptz,
 FOREIGN KEY(connection_id,identity_id) REFERENCES public.bank_connection(id,identity_id) ON DELETE RESTRICT,
 UNIQUE(connection_id,identity_id));
CREATE TABLE st248_bank.receipt (
 identity_id uuid NOT NULL, key_h bytea NOT NULL CHECK(octet_length(key_h)=32),
 request_h bytea NOT NULL CHECK(octet_length(request_h)=32),
 operation text NOT NULL CHECK(operation IN ('connect','sync','disconnect')),
 connection_id uuid NOT NULL, status text NOT NULL CHECK(status IN ('ACTIVE','REVOKED')),
 disposition text NOT NULL CHECK(disposition IN ('retained','purged')),
 account_count integer NOT NULL CHECK(account_count BETWEEN 0 AND 1000000),
 transaction_count integer NOT NULL CHECK(transaction_count BETWEEN 0 AND 1000000),
 last_sync_at timestamptz,
 CHECK(disposition<>'purged' OR (status='REVOKED' AND account_count=0 AND transaction_count=0)),
 PRIMARY KEY(identity_id,key_h),
 FOREIGN KEY(connection_id,identity_id) REFERENCES st248_bank.generation(connection_id,identity_id) ON DELETE RESTRICT);
ALTER TABLE st248_bank.generation OWNER TO subtrack_auth_owner;
ALTER TABLE st248_bank.receipt OWNER TO subtrack_auth_owner;
ALTER TABLE public.bank_connection ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_connection FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bank_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_account FORCE ROW LEVEL SECURITY;
ALTER TABLE public.raw_transaction ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_transaction FORCE ROW LEVEL SECURITY;
ALTER TABLE st248_bank.generation ENABLE ROW LEVEL SECURITY;
ALTER TABLE st248_bank.generation FORCE ROW LEVEL SECURITY;
ALTER TABLE st248_bank.receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE st248_bank.receipt FORCE ROW LEVEL SECURITY;
CREATE POLICY generation_owner ON st248_bank.generation TO subtrack_runtime
 USING(public.subtrack_principal_matches(identity_id)) WITH CHECK(public.subtrack_principal_matches(identity_id));
CREATE POLICY receipt_owner ON st248_bank.receipt TO subtrack_runtime
 USING(public.subtrack_principal_matches(identity_id)) WITH CHECK(public.subtrack_principal_matches(identity_id));
GRANT SELECT,INSERT ON st248_bank.generation,st248_bank.receipt TO subtrack_runtime;
GRANT UPDATE(purged_at) ON st248_bank.generation TO subtrack_runtime;
CREATE UNIQUE INDEX st248_one_active ON public.bank_connection(identity_id)
 WHERE provider='SYNTHETIC' AND institution_id='synthetic-demo-v1' AND status='ACTIVE';
COMMIT;
