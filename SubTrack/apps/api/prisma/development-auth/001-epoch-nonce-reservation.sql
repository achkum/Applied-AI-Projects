-- ST-233a: disposable development foundation only; psql ON_ERROR_STOP required.
-- No capacity, clock, dispatch, burn/settlement or authentication functions.
BEGIN;
SET LOCAL search_path = pg_catalog;
SELECT pg_catalog.current_database() IN ('st233a_development_auth_foundation_proof','st237_private_https_profile')
  AND SESSION_USER = 'st233a_fixture_owner'
  AND pg_catalog.current_setting('server_version_num')::integer BETWEEN 160000 AND 169999
  AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'subtrack_auth')
  AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname IN
    ('subtrack_auth_owner','subtrack_auth_executor','subtrack_auth_producer','subtrack_dev_auth_login'))
  AND EXISTS (SELECT 1 FROM public.st233a_fixture_control WHERE task = 'ST-233a'
    AND head = pg_catalog.current_setting('st233a.head')
    AND marker = pg_catalog.current_setting('st233a.marker') AND marker ~ '^[a-f0-9]{32}$') AS qualified_fixture \gset
-- A false guard raises SQLSTATE 22012 before DDL and aborts the transaction.
SELECT 1 / (:'qualified_fixture'::pg_catalog.bool)::pg_catalog.int4;
CREATE ROLE subtrack_auth_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE subtrack_auth_executor NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE subtrack_auth_producer NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE subtrack_dev_auth_login LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT subtrack_runtime, subtrack_identity_provisioner, subtrack_auth_producer
  TO subtrack_dev_auth_login WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
CREATE SCHEMA subtrack_auth AUTHORIZATION subtrack_auth_owner;
REVOKE ALL ON SCHEMA subtrack_auth FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE subtrack_auth_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE subtrack_auth_owner REVOKE USAGE ON TYPES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE subtrack_auth_executor REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE subtrack_auth_executor REVOKE USAGE ON TYPES FROM PUBLIC;
SET LOCAL ROLE subtrack_auth_owner;
CREATE DOMAIN subtrack_auth.h AS pg_catalog.text
  CHECK (VALUE ~ '^[a-f0-9]{64}$');
CREATE DOMAIN subtrack_auth.ms AS pg_catalog.int8
  CHECK (VALUE BETWEEN 0 AND 9007199254740991);
CREATE TABLE subtrack_auth.epoch (
  id pg_catalog.text PRIMARY KEY CHECK (id <> ''),
  manifest_h subtrack_auth.h NOT NULL,
  origin pg_catalog.text NOT NULL CHECK (origin = (CASE pg_catalog.current_database() WHEN 'st233a_development_auth_foundation_proof' THEN 'https://st233a.invalid' WHEN 'st237_private_https_profile' THEN 'https://localhost:3443' ELSE NULL END)),
  watermark_ms subtrack_auth.ms NOT NULL,
  state pg_catalog.text NOT NULL CHECK (state IN ('active','retired')),
  UNIQUE (id, origin)
);
CREATE TABLE subtrack_auth.reservation (
  key_h subtrack_auth.h PRIMARY KEY,
  operation pg_catalog.text NOT NULL CHECK (operation <> ''),
  authority_kind pg_catalog.text NOT NULL CHECK (authority_kind <> ''),
  authority_h subtrack_auth.h NOT NULL,
  request_h subtrack_auth.h NOT NULL,
  owner_h subtrack_auth.h NOT NULL UNIQUE,
  transport pg_catalog.text NOT NULL CHECK (transport = 'web'),
  epoch pg_catalog.text NOT NULL REFERENCES subtrack_auth.epoch(id),
  issued_ms subtrack_auth.ms NOT NULL,
  expires_ms subtrack_auth.ms NOT NULL,
  state pg_catalog.text NOT NULL CHECK (state IN ('pending','completed','failed')),
  CHECK (expires_ms > issued_ms AND expires_ms - issued_ms <= 86400000)
);
CREATE TABLE subtrack_auth.nonce (
  nonce_h subtrack_auth.h PRIMARY KEY,
  transport pg_catalog.text NOT NULL CHECK (transport = 'web'),
  origin pg_catalog.text NOT NULL CHECK (origin = (CASE pg_catalog.current_database() WHEN 'st233a_development_auth_foundation_proof' THEN 'https://st233a.invalid' WHEN 'st237_private_https_profile' THEN 'https://localhost:3443' ELSE NULL END)),
  chain pg_catalog.text NOT NULL CHECK (chain <> ''),
  binding_h subtrack_auth.h NOT NULL,
  epoch pg_catalog.text NOT NULL REFERENCES subtrack_auth.epoch(id),
  issued_ms subtrack_auth.ms NOT NULL,
  expires_ms subtrack_auth.ms NOT NULL,
  purpose pg_catalog.text NOT NULL CHECK (purpose IN ('enroll_identifier','otp_step_up','session')),
  authority_h subtrack_auth.h,
  FOREIGN KEY (epoch, origin) REFERENCES subtrack_auth.epoch(id, origin),
  CHECK (expires_ms > issued_ms AND expires_ms - issued_ms = 300000)
);
ALTER TABLE subtrack_auth.epoch ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtrack_auth.epoch FORCE ROW LEVEL SECURITY;
ALTER TABLE subtrack_auth.reservation ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtrack_auth.reservation FORCE ROW LEVEL SECURITY;
ALTER TABLE subtrack_auth.nonce ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtrack_auth.nonce FORCE ROW LEVEL SECURITY;
CREATE POLICY epoch_select ON subtrack_auth.epoch FOR SELECT TO subtrack_auth_executor USING (true);
CREATE POLICY epoch_watermark ON subtrack_auth.epoch FOR UPDATE TO subtrack_auth_executor USING (true) WITH CHECK (true);
CREATE POLICY reservation_select ON subtrack_auth.reservation FOR SELECT TO subtrack_auth_executor USING (true);
CREATE POLICY reservation_insert ON subtrack_auth.reservation FOR INSERT TO subtrack_auth_executor WITH CHECK (true);
CREATE POLICY reservation_delete ON subtrack_auth.reservation FOR DELETE TO subtrack_auth_executor USING (true);
CREATE POLICY reservation_settle ON subtrack_auth.reservation FOR UPDATE TO subtrack_auth_executor USING (true) WITH CHECK (true);
CREATE POLICY nonce_select ON subtrack_auth.nonce FOR SELECT TO subtrack_auth_executor USING (true);
CREATE POLICY nonce_insert ON subtrack_auth.nonce FOR INSERT TO subtrack_auth_executor WITH CHECK (true);
CREATE POLICY nonce_delete ON subtrack_auth.nonce FOR DELETE TO subtrack_auth_executor USING (true);
REVOKE ALL ON ALL TABLES IN SCHEMA subtrack_auth FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA subtrack_auth FROM PUBLIC;
REVOKE ALL ON TYPE subtrack_auth.h, subtrack_auth.ms FROM PUBLIC;
GRANT USAGE ON SCHEMA subtrack_auth TO subtrack_runtime, subtrack_auth_producer, subtrack_auth_executor;
GRANT USAGE ON TYPE subtrack_auth.h, subtrack_auth.ms TO subtrack_runtime, subtrack_auth_producer, subtrack_auth_executor;
GRANT SELECT ON subtrack_auth.epoch TO subtrack_auth_executor;
GRANT UPDATE(watermark_ms) ON subtrack_auth.epoch TO subtrack_auth_executor;
GRANT SELECT, INSERT, DELETE ON subtrack_auth.reservation, subtrack_auth.nonce TO subtrack_auth_executor;
GRANT UPDATE(state) ON subtrack_auth.reservation TO subtrack_auth_executor;
RESET ROLE;
COMMIT;
