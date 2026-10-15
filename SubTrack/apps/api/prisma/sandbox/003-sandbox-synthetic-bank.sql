-- Transaction body only: the explicit reviewed installer/upgrader owns BEGIN/COMMIT.
SET LOCAL search_path=pg_catalog;
SELECT 1/(current_database()='subtrack_sandbox' AND SESSION_USER='subtrack_sandbox_bootstrap'
 AND current_setting('server_version_num')::int BETWEEN 160000 AND 169999
 AND current_setting('st250.previous_manifest')~'^[a-f0-9]{64}$'
 AND current_setting('st250.manifest')~'^[a-f0-9]{64}$'
 AND current_setting('st250.bank_sha256')~'^[a-f0-9]{64}$'
 AND EXISTS(SELECT 1 FROM st250_auth.epoch WHERE id='st250-sandbox-v1' AND manifest_h=current_setting('st250.previous_manifest') AND active)
 AND (SELECT count(*) FROM st250_auth.migration)=2
 AND EXISTS(SELECT 1 FROM st250_auth.migration WHERE id=1 AND sha256=current_setting('st250.foundation_sha256'))
 AND EXISTS(SELECT 1 FROM st250_auth.migration WHERE id=2 AND sha256=current_setting('st250.business_sha256'))
 AND NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='st248_bank'))::int;
CREATE TYPE public.bank_provider AS ENUM('SYNTHETIC');
CREATE TYPE public.bank_connection_status AS ENUM('ACTIVE','REVOKED');
CREATE TYPE public.account_type AS ENUM('CHECKING');
CREATE TYPE public.transaction_status AS ENUM('BOOKED');
ALTER TYPE public.bank_provider OWNER TO subtrack_sandbox_owner;
ALTER TYPE public.bank_connection_status OWNER TO subtrack_sandbox_owner;
ALTER TYPE public.account_type OWNER TO subtrack_sandbox_owner;
ALTER TYPE public.transaction_status OWNER TO subtrack_sandbox_owner;
REVOKE ALL ON TYPE public.bank_provider,public.bank_connection_status,public.account_type,public.transaction_status FROM PUBLIC;
GRANT USAGE ON TYPE public.bank_provider,public.bank_connection_status,public.account_type,public.transaction_status TO subtrack_sandbox_runtime;
CREATE TABLE public.bank_connection(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),identity_id uuid NOT NULL REFERENCES public.identity(id) ON DELETE RESTRICT,
 provider public.bank_provider NOT NULL CHECK(provider='SYNTHETIC'),provider_connection_id varchar(255) CHECK(provider_connection_id IS NULL),
 institution_id varchar(255) NOT NULL CHECK(institution_id='synthetic-demo-v1'),institution_name varchar(120) NOT NULL CHECK(institution_name='Synthetic Demo Bank'),
 status public.bank_connection_status NOT NULL,consent_expires_at timestamptz CHECK(consent_expires_at IS NULL),encrypted_credentials bytea CHECK(encrypted_credentials IS NULL),
 last_synced_at timestamptz,revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL,
 CHECK((status='ACTIVE' AND revoked_at IS NULL) OR (status='REVOKED' AND revoked_at IS NOT NULL)),UNIQUE(id,identity_id));
CREATE TABLE public.bank_account(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),connection_id uuid NOT NULL,identity_id uuid NOT NULL,
 provider_account_id varchar(255) NOT NULL,name varchar(120) NOT NULL CHECK(name='Synthetic account'),type public.account_type NOT NULL CHECK(type='CHECKING'),
 iban_last4 char(4) CHECK(iban_last4 IS NULL),currency char(3) NOT NULL CHECK(currency='SEK'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL,
 FOREIGN KEY(connection_id,identity_id) REFERENCES public.bank_connection(id,identity_id) ON DELETE RESTRICT,
 UNIQUE(connection_id,provider_account_id),UNIQUE(id,identity_id),UNIQUE(connection_id));
CREATE TABLE public.raw_transaction(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),account_id uuid NOT NULL,identity_id uuid NOT NULL,
 provider_transaction_id varchar(255) NOT NULL,amount_minor bigint NOT NULL,currency char(3) NOT NULL CHECK(currency='SEK'),
 original_amount_minor bigint CHECK(original_amount_minor IS NULL),original_currency char(3) CHECK(original_currency IS NULL),
 transaction_date date NOT NULL,booked_at timestamptz CHECK(booked_at IS NULL),value_date date CHECK(value_date IS NULL),status public.transaction_status NOT NULL CHECK(status='BOOKED'),
 raw_description varchar(500) NOT NULL,merchant_id uuid CHECK(merchant_id IS NULL),provider_category varchar(120) CHECK(provider_category IS NULL),is_refund boolean NOT NULL CHECK(NOT is_refund),
 dedupe_hash varchar(64) NOT NULL CHECK(dedupe_hash~'^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL,
 FOREIGN KEY(account_id,identity_id) REFERENCES public.bank_account(id,identity_id) ON DELETE RESTRICT,
 UNIQUE(account_id,provider_transaction_id),UNIQUE(id,identity_id));
CREATE SCHEMA st248_bank AUTHORIZATION subtrack_sandbox_owner;
REVOKE ALL ON SCHEMA st248_bank FROM PUBLIC;
GRANT USAGE ON SCHEMA st248_bank TO subtrack_sandbox_runtime;
CREATE TABLE st248_bank.generation(
 connection_id uuid PRIMARY KEY,identity_id uuid NOT NULL,fixture_version text NOT NULL CHECK(fixture_version='solberg-v1'),purged_at timestamptz,
 FOREIGN KEY(connection_id,identity_id) REFERENCES public.bank_connection(id,identity_id) ON DELETE RESTRICT,UNIQUE(connection_id,identity_id));
CREATE TABLE st248_bank.receipt(
 identity_id uuid NOT NULL,key_h bytea NOT NULL CHECK(octet_length(key_h)=32),request_h bytea NOT NULL CHECK(octet_length(request_h)=32),
 operation text NOT NULL CHECK(operation IN('connect','sync','disconnect')),connection_id uuid NOT NULL,status text NOT NULL CHECK(status IN('ACTIVE','REVOKED')),
 disposition text NOT NULL CHECK(disposition IN('retained','purged')),account_count integer NOT NULL CHECK(account_count BETWEEN 0 AND 1),
 transaction_count integer NOT NULL CHECK(transaction_count BETWEEN 0 AND 87),last_sync_at timestamptz,
 CHECK(disposition<>'purged' OR(status='REVOKED' AND account_count=0 AND transaction_count=0)),
 CHECK((operation='disconnect' AND status='REVOKED') OR(operation IN('connect','sync') AND status='ACTIVE' AND disposition='retained')),
 PRIMARY KEY(identity_id,key_h),FOREIGN KEY(connection_id,identity_id) REFERENCES st248_bank.generation(connection_id,identity_id) ON DELETE RESTRICT);
CREATE UNIQUE INDEX st248_one_active ON public.bank_connection(identity_id) WHERE provider='SYNTHETIC' AND institution_id='synthetic-demo-v1' AND status='ACTIVE';
ALTER TABLE public.bank_connection OWNER TO subtrack_sandbox_owner;
ALTER TABLE public.bank_connection ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_connection FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.bank_connection FROM PUBLIC;
CREATE POLICY bank_runtime_owner ON public.bank_connection TO subtrack_sandbox_runtime USING(public.subtrack_principal_matches(identity_id)) WITH CHECK(public.subtrack_principal_matches(identity_id));
CREATE POLICY bank_capacity_owner ON public.bank_connection FOR SELECT TO subtrack_sandbox_owner USING(true);
GRANT SELECT ON public.bank_connection TO subtrack_sandbox_runtime;
ALTER TABLE public.bank_account OWNER TO subtrack_sandbox_owner;
ALTER TABLE public.bank_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_account FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.bank_account FROM PUBLIC;
CREATE POLICY bank_runtime_owner ON public.bank_account TO subtrack_sandbox_runtime USING(public.subtrack_principal_matches(identity_id)) WITH CHECK(public.subtrack_principal_matches(identity_id));
CREATE POLICY bank_capacity_owner ON public.bank_account FOR SELECT TO subtrack_sandbox_owner USING(true);
GRANT SELECT ON public.bank_account TO subtrack_sandbox_runtime;
ALTER TABLE public.raw_transaction OWNER TO subtrack_sandbox_owner;
ALTER TABLE public.raw_transaction ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_transaction FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.raw_transaction FROM PUBLIC;
CREATE POLICY bank_runtime_owner ON public.raw_transaction TO subtrack_sandbox_runtime USING(public.subtrack_principal_matches(identity_id)) WITH CHECK(public.subtrack_principal_matches(identity_id));
CREATE POLICY bank_capacity_owner ON public.raw_transaction FOR SELECT TO subtrack_sandbox_owner USING(true);
GRANT SELECT ON public.raw_transaction TO subtrack_sandbox_runtime;
ALTER TABLE st248_bank.generation OWNER TO subtrack_sandbox_owner;
ALTER TABLE st248_bank.generation ENABLE ROW LEVEL SECURITY;
ALTER TABLE st248_bank.generation FORCE ROW LEVEL SECURITY;
REVOKE ALL ON st248_bank.generation FROM PUBLIC;
CREATE POLICY bank_runtime_owner ON st248_bank.generation TO subtrack_sandbox_runtime USING(public.subtrack_principal_matches(identity_id)) WITH CHECK(public.subtrack_principal_matches(identity_id));
CREATE POLICY bank_capacity_owner ON st248_bank.generation FOR SELECT TO subtrack_sandbox_owner USING(true);
GRANT SELECT ON st248_bank.generation TO subtrack_sandbox_runtime;
ALTER TABLE st248_bank.receipt OWNER TO subtrack_sandbox_owner;
ALTER TABLE st248_bank.receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE st248_bank.receipt FORCE ROW LEVEL SECURITY;
REVOKE ALL ON st248_bank.receipt FROM PUBLIC;
CREATE POLICY bank_runtime_owner ON st248_bank.receipt TO subtrack_sandbox_runtime USING(public.subtrack_principal_matches(identity_id)) WITH CHECK(public.subtrack_principal_matches(identity_id));
CREATE POLICY bank_capacity_owner ON st248_bank.receipt FOR SELECT TO subtrack_sandbox_owner USING(true);
GRANT SELECT ON st248_bank.receipt TO subtrack_sandbox_runtime;
GRANT INSERT(id,identity_id,provider,institution_id,institution_name,status,updated_at) ON public.bank_connection TO subtrack_sandbox_runtime;
GRANT UPDATE(status,revoked_at,last_synced_at,updated_at) ON public.bank_connection TO subtrack_sandbox_runtime;
GRANT INSERT(id,connection_id,identity_id,provider_account_id,name,type,currency,updated_at) ON public.bank_account TO subtrack_sandbox_runtime;
GRANT INSERT(account_id,identity_id,provider_transaction_id,amount_minor,currency,transaction_date,status,raw_description,is_refund,dedupe_hash,updated_at) ON public.raw_transaction TO subtrack_sandbox_runtime;
GRANT UPDATE(amount_minor,currency,transaction_date,status,raw_description,dedupe_hash,updated_at) ON public.raw_transaction TO subtrack_sandbox_runtime;
GRANT DELETE ON public.raw_transaction,public.bank_account TO subtrack_sandbox_runtime;
GRANT INSERT(connection_id,identity_id,fixture_version) ON st248_bank.generation TO subtrack_sandbox_runtime;
GRANT UPDATE(purged_at) ON st248_bank.generation TO subtrack_sandbox_runtime;
GRANT INSERT(identity_id,key_h,request_h,operation,connection_id,status,disposition,account_count,transaction_count,last_sync_at) ON st248_bank.receipt TO subtrack_sandbox_runtime;
CREATE OR REPLACE FUNCTION st250_auth.guard_growth() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE owner_id uuid; retained bigint; owner_retained bigint; reserved bigint; bank_id uuid;
BEGIN
 PERFORM id FROM st250_auth.capacity WHERE id=1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sandbox capacity unavailable' USING ERRCODE='P0250';END IF;
 IF TG_TABLE_NAME='identity' THEN IF (SELECT count(*) FROM public.identity)>=100 THEN RAISE EXCEPTION 'Sandbox capacity unavailable' USING ERRCODE='P0250';END IF;RETURN NEW;END IF;
 IF TG_TABLE_NAME='reservation' THEN IF (SELECT count(*) FROM st250_auth.reservation)>=2048 THEN RAISE EXCEPTION 'Sandbox capacity unavailable' USING ERRCODE='P0250';END IF;RETURN NEW;END IF;
 owner_id=NEW.identity_id;PERFORM id FROM public.identity WHERE id=owner_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Sandbox owner unavailable' USING ERRCODE='23503';END IF;
 IF TG_TABLE_NAME='session' THEN SELECT count(*) INTO retained FROM st250_auth.session;SELECT count(*) INTO owner_retained FROM st250_auth.session WHERE identity_id=owner_id;IF retained>=3200 OR owner_retained>=32 OR NOT EXISTS(SELECT 1 FROM st250_auth.capability WHERE identity_id=owner_id AND revoked_ms IS NULL AND NEW.created_ms>=created_ms AND NEW.expires_ms<=expires_ms) THEN RAISE EXCEPTION 'Sandbox capacity unavailable' USING ERRCODE='P0250';END IF;
 ELSIF TG_TABLE_NAME='consumed_refresh' THEN IF (SELECT count(*) FROM st250_auth.consumed_refresh)>=3200 THEN RAISE EXCEPTION 'Sandbox capacity unavailable' USING ERRCODE='P0250';END IF;
 ELSIF TG_TABLE_NAME='subscription' THEN IF (SELECT count(*) FROM public.subscription WHERE identity_id=owner_id)>=50 THEN RAISE EXCEPTION 'Sandbox capacity unavailable' USING ERRCODE='P0250';END IF;IF NEW.revision<>1 OR NEW.merchant_id IS NOT NULL THEN RAISE EXCEPTION 'Sandbox manual row unavailable' USING ERRCODE='23514';END IF;
 ELSIF TG_TABLE_NAME IN('manual_subscription_create_receipt','manual_subscription_edit_receipt') THEN IF (SELECT count(*) FROM public.manual_subscription_create_receipt WHERE identity_id=owner_id)+(SELECT count(*) FROM public.manual_subscription_edit_receipt WHERE identity_id=owner_id)>=256 THEN RAISE EXCEPTION 'Sandbox capacity unavailable' USING ERRCODE='P0250';END IF;
 ELSIF TG_TABLE_SCHEMA='public' AND TG_TABLE_NAME='bank_connection' THEN
  IF NOT public.subtrack_principal_matches(owner_id) OR(SELECT count(*) FROM public.bank_connection WHERE identity_id=owner_id)>=50 THEN RAISE EXCEPTION 'Sandbox bank capacity unavailable' USING ERRCODE='P0250';END IF;
 ELSIF TG_TABLE_SCHEMA='st248_bank' AND TG_TABLE_NAME='generation' THEN
  IF NOT public.subtrack_principal_matches(owner_id) OR(SELECT count(*) FROM st248_bank.generation WHERE identity_id=owner_id)>=50 THEN RAISE EXCEPTION 'Sandbox bank capacity unavailable' USING ERRCODE='P0250';END IF;
 ELSIF TG_TABLE_SCHEMA='public' AND TG_TABLE_NAME='bank_account' THEN
  IF NOT public.subtrack_principal_matches(owner_id) OR(SELECT count(*) FROM public.bank_account WHERE identity_id=owner_id)>=50 OR EXISTS(SELECT 1 FROM public.bank_account WHERE identity_id=owner_id AND connection_id=NEW.connection_id) THEN RAISE EXCEPTION 'Sandbox bank capacity unavailable' USING ERRCODE='P0250';END IF;
 ELSIF TG_TABLE_SCHEMA='public' AND TG_TABLE_NAME='raw_transaction' THEN
  SELECT bc.id INTO bank_id FROM public.bank_account ba JOIN public.bank_connection bc ON bc.id=ba.connection_id AND bc.identity_id=ba.identity_id JOIN st248_bank.generation bg ON bg.connection_id=bc.id AND bg.identity_id=bc.identity_id
   WHERE ba.id=NEW.account_id AND ba.identity_id=owner_id AND bc.status='ACTIVE' AND bc.provider='SYNTHETIC' AND bc.institution_id='synthetic-demo-v1' AND bg.fixture_version='solberg-v1' AND bg.purged_at IS NULL;
  IF NOT FOUND OR NOT public.subtrack_principal_matches(owner_id) THEN RAISE EXCEPTION 'Sandbox bank owner unavailable' USING ERRCODE='23514';END IF;
  -- BEFORE INSERT also runs for ON CONFLICT UPDATE: existing charge keys consume no new row.
  IF NOT EXISTS(SELECT 1 FROM public.raw_transaction WHERE identity_id=owner_id AND account_id=NEW.account_id AND provider_transaction_id=NEW.provider_transaction_id) THEN
   IF(SELECT count(*) FROM public.raw_transaction WHERE identity_id=owner_id)>=4350 OR(SELECT count(*) FROM public.raw_transaction rt JOIN public.bank_account ba ON ba.id=rt.account_id AND ba.identity_id=rt.identity_id WHERE rt.identity_id=owner_id AND ba.connection_id=bank_id)>=87 THEN RAISE EXCEPTION 'Sandbox bank capacity unavailable' USING ERRCODE='P0250';END IF;
  END IF;
 ELSIF TG_TABLE_SCHEMA='st248_bank' AND TG_TABLE_NAME='receipt' THEN
  IF NOT public.subtrack_principal_matches(owner_id) THEN RAISE EXCEPTION 'Sandbox bank owner unavailable' USING ERRCODE='23514';END IF;
  SELECT count(*) INTO retained FROM st248_bank.receipt WHERE identity_id=owner_id;
  SELECT COALESCE(sum(CASE WHEN bc.status='ACTIVE' THEN 2 ELSE 1 END),0) INTO reserved FROM st248_bank.generation bg JOIN public.bank_connection bc ON bc.id=bg.connection_id AND bc.identity_id=bg.identity_id WHERE bg.identity_id=owner_id AND bg.purged_at IS NULL;
  -- retained excludes NEW; reserved is measured after the current operation's mutations.
  IF retained+1+reserved>256 THEN RAISE EXCEPTION 'Sandbox bank capacity unavailable' USING ERRCODE='P0250';END IF;
 ELSE RAISE EXCEPTION 'Sandbox growth unavailable' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
ALTER FUNCTION st250_auth.guard_growth() OWNER TO subtrack_sandbox_owner;
REVOKE ALL ON FUNCTION st250_auth.guard_growth() FROM PUBLIC;
CREATE TRIGGER sandbox_bank_capacity BEFORE INSERT ON public.bank_connection FOR EACH ROW EXECUTE FUNCTION st250_auth.guard_growth();
CREATE TRIGGER sandbox_bank_capacity BEFORE INSERT ON public.bank_account FOR EACH ROW EXECUTE FUNCTION st250_auth.guard_growth();
CREATE TRIGGER sandbox_bank_capacity BEFORE INSERT ON public.raw_transaction FOR EACH ROW EXECUTE FUNCTION st250_auth.guard_growth();
CREATE TRIGGER sandbox_bank_capacity BEFORE INSERT ON st248_bank.generation FOR EACH ROW EXECUTE FUNCTION st250_auth.guard_growth();
CREATE TRIGGER sandbox_bank_capacity BEFORE INSERT ON st248_bank.receipt FOR EACH ROW EXECUTE FUNCTION st250_auth.guard_growth();
ALTER TABLE st250_auth.migration DROP CONSTRAINT migration_id_check;
ALTER TABLE st250_auth.migration ADD CONSTRAINT migration_id_check CHECK(id IN(1,2,3));
INSERT INTO st250_auth.migration VALUES(3,current_setting('st250.bank_sha256'));
DO $$ DECLARE changed integer; BEGIN
 UPDATE st250_auth.epoch SET manifest_h=current_setting('st250.manifest') WHERE id='st250-sandbox-v1' AND manifest_h=current_setting('st250.previous_manifest') AND active;
 GET DIAGNOSTICS changed=ROW_COUNT;IF changed<>1 THEN RAISE EXCEPTION 'Sandbox upgrade unavailable' USING ERRCODE='23514';END IF;
END $$;
