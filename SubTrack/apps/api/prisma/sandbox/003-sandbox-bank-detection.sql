-- Additive isolated sandbox expansion. Foundation epoch/capabilities and existing rows are preserved.
-- The enum addition commits separately because PostgreSQL cannot use a new enum label in its creating transaction.
BEGIN;
SET LOCAL search_path=pg_catalog;
SELECT 1/(current_database()='subtrack_sandbox' AND SESSION_USER='subtrack_sandbox_bootstrap' AND current_setting('server_version_num')::int BETWEEN 160000 AND 169999 AND EXISTS(SELECT 1 FROM st250_auth.epoch WHERE id='st250-sandbox-v1' AND manifest_h=current_setting('st250.manifest') AND active))::int;
ALTER TYPE public.subscription_source ADD VALUE IF NOT EXISTS 'DETECTED';
COMMIT;
BEGIN;
SET LOCAL search_path=pg_catalog;
SELECT 1/(current_database()='subtrack_sandbox' AND SESSION_USER='subtrack_sandbox_bootstrap' AND EXISTS(SELECT 1 FROM st250_auth.migration WHERE id=2) AND NOT EXISTS(SELECT 1 FROM st250_auth.migration WHERE id=3))::int;
ALTER TABLE st250_auth.migration DROP CONSTRAINT migration_id_check;
ALTER TABLE st250_auth.migration ADD CHECK(id IN(1,2,3,4));
CREATE TYPE public.bank_provider AS ENUM('SYNTHETIC');
CREATE TYPE public.bank_connection_status AS ENUM('ACTIVE','REVOKED');
CREATE TYPE public.account_type AS ENUM('CHECKING');
CREATE TYPE public.transaction_status AS ENUM('PENDING','BOOKED');
CREATE TABLE public.bank_connection(id uuid PRIMARY KEY,identity_id uuid NOT NULL REFERENCES public.identity(id),provider public.bank_provider NOT NULL,institution_id text NOT NULL CHECK(institution_id='synthetic-demo-v1'),institution_name text NOT NULL,status public.bank_connection_status NOT NULL,last_synced_at timestamptz,revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(id,identity_id));
CREATE TABLE public.bank_account(id uuid PRIMARY KEY,connection_id uuid NOT NULL,identity_id uuid NOT NULL,provider_account_id varchar(255) NOT NULL,name varchar(120) NOT NULL,type public.account_type NOT NULL,currency char(3) NOT NULL CHECK(currency='SEK'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(connection_id,identity_id) REFERENCES public.bank_connection(id,identity_id),UNIQUE(id,identity_id),UNIQUE(connection_id,provider_account_id));
CREATE TABLE public.raw_transaction(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),account_id uuid NOT NULL,identity_id uuid NOT NULL,provider_transaction_id varchar(255) NOT NULL,amount_minor bigint NOT NULL CHECK(amount_minor<>0),currency char(3) NOT NULL CHECK(currency='SEK'),transaction_date date NOT NULL,status public.transaction_status NOT NULL,raw_description varchar(500) NOT NULL,merchant_id uuid REFERENCES public.merchant(id),is_refund boolean NOT NULL,dedupe_hash varchar(64) NOT NULL CHECK(dedupe_hash~'^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(account_id,identity_id) REFERENCES public.bank_account(id,identity_id),UNIQUE(id,identity_id),UNIQUE(account_id,provider_transaction_id));
ALTER TABLE public.bank_connection OWNER TO subtrack_sandbox_owner;
ALTER TABLE public.bank_account OWNER TO subtrack_sandbox_owner;
ALTER TABLE public.raw_transaction OWNER TO subtrack_sandbox_owner;
ALTER TABLE public.subscription DROP CONSTRAINT subscription_source_check;
ALTER TABLE public.subscription DROP CONSTRAINT subscription_status_check;
ALTER TABLE public.subscription ADD CHECK((source='MANUAL' AND status IN('ACTIVE','PAUSED','CANCELLED','ARCHIVED')) OR source='DETECTED');
ALTER TABLE public.subscription ADD COLUMN paying_account_id uuid,ADD COLUMN confidence numeric(5,4),ADD COLUMN detection_reasons jsonb;
ALTER TABLE public.subscription ADD FOREIGN KEY(paying_account_id,identity_id) REFERENCES public.bank_account(id,identity_id) ON DELETE SET NULL(paying_account_id);
ALTER TABLE public.merchant ADD COLUMN slug varchar(160),ADD COLUMN category_code varchar(50);
GRANT INSERT(paying_account_id,merchant_id,confidence,detection_reasons) ON public.subscription TO subtrack_sandbox_runtime;
GRANT UPDATE(paying_account_id) ON public.subscription TO subtrack_sandbox_runtime;
CREATE SCHEMA st248_bank AUTHORIZATION subtrack_sandbox_owner;
REVOKE ALL ON SCHEMA st248_bank FROM PUBLIC;
GRANT USAGE ON SCHEMA st248_bank TO subtrack_sandbox_runtime;
CREATE TABLE st248_bank.generation (
 connection_id uuid PRIMARY KEY, identity_id uuid NOT NULL,
 fixture_version text NOT NULL CHECK(fixture_version='showcase-v2'),
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
ALTER TABLE st248_bank.generation OWNER TO subtrack_sandbox_owner;
ALTER TABLE st248_bank.receipt OWNER TO subtrack_sandbox_owner;
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
CREATE POLICY generation_owner ON st248_bank.generation TO subtrack_sandbox_runtime
 USING(public.subtrack_principal_matches(identity_id)) WITH CHECK(public.subtrack_principal_matches(identity_id));
CREATE POLICY receipt_owner ON st248_bank.receipt TO subtrack_sandbox_runtime
 USING(public.subtrack_principal_matches(identity_id)) WITH CHECK(public.subtrack_principal_matches(identity_id));
GRANT SELECT,INSERT ON st248_bank.generation,st248_bank.receipt TO subtrack_sandbox_runtime;
GRANT UPDATE(purged_at) ON st248_bank.generation TO subtrack_sandbox_runtime;
CREATE UNIQUE INDEX st248_one_active ON public.bank_connection(identity_id)
 WHERE provider='SYNTHETIC' AND institution_id='synthetic-demo-v1' AND status='ACTIVE';

CREATE SCHEMA st081_detection AUTHORIZATION subtrack_sandbox_owner;
REVOKE ALL ON SCHEMA st081_detection FROM PUBLIC;
GRANT USAGE ON SCHEMA st081_detection TO subtrack_sandbox_runtime;

CREATE TABLE st081_detection.candidate (
 identity_id uuid NOT NULL, subscription_id uuid NOT NULL,
 connection_id uuid NOT NULL, account_id uuid,
 merchant_key varchar(160) NOT NULL CHECK(length(merchant_key) BETWEEN 1 AND 160),
 currency char(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 cadence public.subscription_cadence NOT NULL CHECK(cadence<>'CUSTOM'),
 algorithm_version text NOT NULL CHECK(algorithm_version='recurring-bigint-v1'),
 candidate_h bytea NOT NULL CHECK(octet_length(candidate_h)=32),
 PRIMARY KEY(identity_id,subscription_id),
 UNIQUE(identity_id,connection_id,candidate_h),
 FOREIGN KEY(subscription_id,identity_id) REFERENCES public.subscription(id,identity_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 FOREIGN KEY(connection_id,identity_id) REFERENCES st248_bank.generation(connection_id,identity_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 FOREIGN KEY(account_id,identity_id) REFERENCES public.bank_account(id,identity_id) ON UPDATE RESTRICT ON DELETE SET NULL(account_id));
CREATE TABLE st081_detection.source_link (
 identity_id uuid NOT NULL, subscription_id uuid NOT NULL, raw_transaction_id uuid NOT NULL,
 PRIMARY KEY(identity_id,subscription_id,raw_transaction_id),
 FOREIGN KEY(identity_id,subscription_id) REFERENCES st081_detection.candidate(identity_id,subscription_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 FOREIGN KEY(raw_transaction_id,identity_id) REFERENCES public.raw_transaction(id,identity_id) ON UPDATE RESTRICT ON DELETE CASCADE);

CREATE TABLE st081_detection.review_receipt (
 id uuid NOT NULL, identity_id uuid NOT NULL, subscription_id uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN ('confirm','reject','undo')),
 key_h bytea NOT NULL CHECK(octet_length(key_h)=32),
 request_h bytea NOT NULL CHECK(octet_length(request_h)=32),
 pre_revision bigint NOT NULL CHECK(pre_revision>0 AND pre_revision<9223372036854775807),
 post_revision bigint NOT NULL CHECK(post_revision=pre_revision+1),
 prior_status public.subscription_status NOT NULL,
 result_status public.subscription_status NOT NULL,
 completed_at timestamptz NOT NULL CHECK(completed_at=pg_catalog.date_trunc('milliseconds',completed_at)), undo_until timestamptz,
 consumed_at timestamptz, undo_of_receipt_id uuid, feedback_id uuid,
 result_response jsonb NOT NULL,
 PRIMARY KEY(identity_id,id), UNIQUE(identity_id,id,subscription_id),
 UNIQUE(identity_id,operation,subscription_id,key_h),
 UNIQUE(identity_id,undo_of_receipt_id),
 CHECK(undo_of_receipt_id IS NULL OR undo_of_receipt_id<>id),
 CHECK((operation='confirm' AND prior_status='DETECTED' AND result_status='ACTIVE'
   AND undo_until IS NOT NULL AND undo_until=completed_at+INTERVAL '10 seconds' AND undo_of_receipt_id IS NULL AND feedback_id IS NOT NULL)
 OR (operation='reject' AND prior_status='DETECTED' AND result_status='REJECTED'
   AND undo_until IS NOT NULL AND undo_until=completed_at+INTERVAL '10 seconds' AND undo_of_receipt_id IS NULL AND feedback_id IS NOT NULL)
 OR (operation='undo' AND prior_status IN ('ACTIVE','REJECTED') AND result_status='DETECTED'
   AND undo_until IS NULL AND consumed_at IS NULL AND undo_of_receipt_id IS NOT NULL AND feedback_id IS NULL)),
 CHECK(consumed_at IS NULL OR (operation IN ('confirm','reject') AND consumed_at>=completed_at AND consumed_at<undo_until)),
 CHECK(result_response=pg_catalog.jsonb_build_object(
   'candidateId',subscription_id::text,'status',result_status::text,'revision',post_revision::text,
   'receiptId',id::text,'undoUntil',result_response->'undoUntil')),
 CHECK((operation='undo' AND result_response->'undoUntil'='null'::jsonb)
 OR (operation IN ('confirm','reject') AND pg_catalog.jsonb_typeof(result_response->'undoUntil')='string'
   AND result_response->>'undoUntil' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
   AND (result_response->>'undoUntil')::timestamptz=undo_until)),
 FOREIGN KEY(identity_id,subscription_id) REFERENCES st081_detection.candidate(identity_id,subscription_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 FOREIGN KEY(identity_id,undo_of_receipt_id,subscription_id) REFERENCES st081_detection.review_receipt(identity_id,id,subscription_id) ON UPDATE RESTRICT ON DELETE RESTRICT);
CREATE TABLE st081_detection.feedback (
 id uuid NOT NULL, identity_id uuid NOT NULL, subscription_id uuid NOT NULL,
 label text NOT NULL CHECK(label IN ('CONFIRMED_SUBSCRIPTION','NOT_SUBSCRIPTION')),
 created_at timestamptz NOT NULL, superseded_by_event_id uuid,
 PRIMARY KEY(identity_id,id), UNIQUE(identity_id,id,subscription_id),
 FOREIGN KEY(identity_id,subscription_id) REFERENCES st081_detection.candidate(identity_id,subscription_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 FOREIGN KEY(identity_id,superseded_by_event_id,subscription_id) REFERENCES st081_detection.review_receipt(identity_id,id,subscription_id) ON UPDATE RESTRICT ON DELETE RESTRICT);
CREATE UNIQUE INDEX st081_current_feedback ON st081_detection.feedback(identity_id,subscription_id)
 WHERE superseded_by_event_id IS NULL;
CREATE UNIQUE INDEX st081_feedback_compensation ON st081_detection.feedback(identity_id,superseded_by_event_id)
 WHERE superseded_by_event_id IS NOT NULL;
ALTER TABLE st081_detection.review_receipt ADD CONSTRAINT st081_original_feedback
 FOREIGN KEY(identity_id,feedback_id,subscription_id) REFERENCES st081_detection.feedback(identity_id,id,subscription_id)
 ON UPDATE RESTRICT ON DELETE RESTRICT;
CREATE UNIQUE INDEX st081_receipt_feedback ON st081_detection.review_receipt(identity_id,feedback_id)
 WHERE feedback_id IS NOT NULL;
CREATE TABLE st081_detection.scan_receipt (
 identity_id uuid NOT NULL, connection_id uuid NOT NULL,
 key_h bytea NOT NULL CHECK(octet_length(key_h)=32),
 request_h bytea NOT NULL CHECK(octet_length(request_h)=32),
 completed_at timestamptz NOT NULL, result_status text NOT NULL CHECK(result_status='complete'),
 PRIMARY KEY(identity_id,key_h),
 FOREIGN KEY(connection_id,identity_id) REFERENCES st248_bank.generation(connection_id,identity_id) ON UPDATE RESTRICT ON DELETE RESTRICT);

ALTER TABLE st081_detection.candidate OWNER TO subtrack_sandbox_owner;
ALTER TABLE st081_detection.source_link OWNER TO subtrack_sandbox_owner;
ALTER TABLE st081_detection.review_receipt OWNER TO subtrack_sandbox_owner;
ALTER TABLE st081_detection.feedback OWNER TO subtrack_sandbox_owner;
ALTER TABLE st081_detection.scan_receipt OWNER TO subtrack_sandbox_owner;
REVOKE ALL ON st081_detection.candidate,st081_detection.source_link,st081_detection.review_receipt,st081_detection.feedback,st081_detection.scan_receipt FROM PUBLIC;
ALTER TABLE st081_detection.candidate ENABLE ROW LEVEL SECURITY;
ALTER TABLE st081_detection.candidate FORCE ROW LEVEL SECURITY;
ALTER TABLE st081_detection.source_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE st081_detection.source_link FORCE ROW LEVEL SECURITY;
ALTER TABLE st081_detection.review_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE st081_detection.review_receipt FORCE ROW LEVEL SECURITY;
ALTER TABLE st081_detection.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE st081_detection.feedback FORCE ROW LEVEL SECURITY;
ALTER TABLE st081_detection.scan_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE st081_detection.scan_receipt FORCE ROW LEVEL SECURITY;
CREATE POLICY candidate_owner ON st081_detection.candidate TO subtrack_sandbox_runtime USING(public.subtrack_principal_matches(identity_id)) WITH CHECK(public.subtrack_principal_matches(identity_id));
CREATE POLICY source_link_owner ON st081_detection.source_link TO subtrack_sandbox_runtime USING(public.subtrack_principal_matches(identity_id)) WITH CHECK(public.subtrack_principal_matches(identity_id));
CREATE POLICY review_receipt_owner ON st081_detection.review_receipt TO subtrack_sandbox_runtime USING(public.subtrack_principal_matches(identity_id)) WITH CHECK(public.subtrack_principal_matches(identity_id));
CREATE POLICY feedback_owner ON st081_detection.feedback TO subtrack_sandbox_runtime USING(public.subtrack_principal_matches(identity_id)) WITH CHECK(public.subtrack_principal_matches(identity_id));
CREATE POLICY scan_receipt_owner ON st081_detection.scan_receipt TO subtrack_sandbox_runtime USING(public.subtrack_principal_matches(identity_id)) WITH CHECK(public.subtrack_principal_matches(identity_id));
GRANT SELECT,INSERT ON st081_detection.candidate,st081_detection.source_link,st081_detection.review_receipt,st081_detection.feedback,st081_detection.scan_receipt TO subtrack_sandbox_runtime;
GRANT UPDATE(consumed_at) ON st081_detection.review_receipt TO subtrack_sandbox_runtime;
GRANT UPDATE(superseded_by_event_id) ON st081_detection.feedback TO subtrack_sandbox_runtime;
-- Candidate identity is immutable. Lock the existing subscription row in the
-- named candidate lock, under the authority's existing owner-identity lock;
-- no candidate UPDATE privilege is needed or proposed.

CREATE POLICY bank_connection_owner ON public.bank_connection TO subtrack_sandbox_runtime USING(public.subtrack_principal_matches(identity_id)) WITH CHECK(public.subtrack_principal_matches(identity_id));
REVOKE ALL ON public.bank_connection FROM PUBLIC;
GRANT SELECT,INSERT ON public.bank_connection TO subtrack_sandbox_runtime;
CREATE POLICY bank_account_owner ON public.bank_account TO subtrack_sandbox_runtime USING(public.subtrack_principal_matches(identity_id)) WITH CHECK(public.subtrack_principal_matches(identity_id));
REVOKE ALL ON public.bank_account FROM PUBLIC;
GRANT SELECT,INSERT ON public.bank_account TO subtrack_sandbox_runtime;
CREATE POLICY raw_transaction_owner ON public.raw_transaction TO subtrack_sandbox_runtime USING(public.subtrack_principal_matches(identity_id)) WITH CHECK(public.subtrack_principal_matches(identity_id));
REVOKE ALL ON public.raw_transaction FROM PUBLIC;
GRANT SELECT,INSERT ON public.raw_transaction TO subtrack_sandbox_runtime;
GRANT UPDATE(status,last_synced_at,revoked_at,updated_at) ON public.bank_connection TO subtrack_sandbox_runtime;
GRANT UPDATE(amount_minor,currency,transaction_date,status,raw_description,dedupe_hash,updated_at) ON public.raw_transaction TO subtrack_sandbox_runtime;
GRANT DELETE ON public.raw_transaction,public.bank_account TO subtrack_sandbox_runtime;
-- FK source-link cascade only follows an explicit owner-authorized purge. Detected subscription rows remain.
CREATE OR REPLACE FUNCTION st250_auth.guard_growth() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE owner_id uuid; retained bigint; owner_retained bigint;
BEGIN
 PERFORM id FROM st250_auth.capacity WHERE id=1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sandbox capacity unavailable' USING ERRCODE='P0250';END IF;
 IF TG_TABLE_NAME='identity' THEN IF (SELECT count(*) FROM public.identity)>=100 THEN RAISE EXCEPTION 'Sandbox capacity unavailable' USING ERRCODE='P0250';END IF;RETURN NEW;END IF;
 IF TG_TABLE_NAME='reservation' THEN IF (SELECT count(*) FROM st250_auth.reservation)>=2048 THEN RAISE EXCEPTION 'Sandbox capacity unavailable' USING ERRCODE='P0250';END IF;RETURN NEW;END IF;
 owner_id=NEW.identity_id;PERFORM id FROM public.identity WHERE id=owner_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Sandbox owner unavailable' USING ERRCODE='23503';END IF;
 IF TG_TABLE_NAME='session' THEN SELECT count(*) INTO retained FROM st250_auth.session;SELECT count(*) INTO owner_retained FROM st250_auth.session WHERE identity_id=owner_id;IF retained>=3200 OR owner_retained>=32 OR NOT EXISTS(SELECT 1 FROM st250_auth.capability WHERE identity_id=owner_id AND revoked_ms IS NULL AND NEW.created_ms>=created_ms AND NEW.expires_ms<=expires_ms) THEN RAISE EXCEPTION 'Sandbox capacity unavailable' USING ERRCODE='P0250';END IF;
 ELSIF TG_TABLE_NAME='consumed_refresh' THEN IF (SELECT count(*) FROM st250_auth.consumed_refresh)>=3200 THEN RAISE EXCEPTION 'Sandbox capacity unavailable' USING ERRCODE='P0250';END IF;
 ELSIF TG_TABLE_NAME='subscription' THEN IF (SELECT count(*) FROM public.subscription WHERE identity_id=owner_id)>=50 THEN RAISE EXCEPTION 'Sandbox capacity unavailable' USING ERRCODE='P0250';END IF;IF NEW.revision<>1 OR NEW.merchant_id IS NOT NULL OR NEW.source NOT IN('MANUAL','DETECTED') THEN RAISE EXCEPTION 'Sandbox manual row unavailable' USING ERRCODE='23514';END IF;
 ELSIF TG_TABLE_NAME IN('manual_subscription_create_receipt','manual_subscription_edit_receipt') THEN IF (SELECT count(*) FROM public.manual_subscription_create_receipt WHERE identity_id=owner_id)+(SELECT count(*) FROM public.manual_subscription_edit_receipt WHERE identity_id=owner_id)>=256 THEN RAISE EXCEPTION 'Sandbox capacity unavailable' USING ERRCODE='P0250';END IF;
 ELSE RAISE EXCEPTION 'Sandbox growth unavailable' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
CREATE FUNCTION st250_auth.guard_bank_growth() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE retained bigint;cap integer;
BEGIN
 PERFORM id FROM st250_auth.capacity WHERE id=1 FOR UPDATE;
 IF NOT FOUND OR NOT public.subtrack_principal_matches(NEW.identity_id) THEN RAISE EXCEPTION 'Sandbox capacity unavailable' USING ERRCODE='P0250';END IF;
 cap=CASE TG_TABLE_NAME WHEN 'raw_transaction' THEN 5000 WHEN 'bank_connection' THEN 50 WHEN 'bank_account' THEN 50 ELSE 1024 END;
 EXECUTE format('SELECT count(*) FROM %I.%I WHERE identity_id=$1',TG_TABLE_SCHEMA,TG_TABLE_NAME) INTO retained USING NEW.identity_id;
 IF retained>=cap THEN RAISE EXCEPTION 'Sandbox capacity unavailable' USING ERRCODE='P0250';END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION st250_auth.guard_bank_growth() OWNER TO subtrack_sandbox_owner;
REVOKE ALL ON FUNCTION st250_auth.guard_bank_growth() FROM PUBLIC;
CREATE POLICY sandbox_capacity_count ON public.bank_connection FOR SELECT TO subtrack_sandbox_owner USING(true);
CREATE TRIGGER sandbox_bank_capacity BEFORE INSERT ON public.bank_connection FOR EACH ROW EXECUTE FUNCTION st250_auth.guard_bank_growth();
CREATE POLICY sandbox_capacity_count ON public.bank_account FOR SELECT TO subtrack_sandbox_owner USING(true);
CREATE TRIGGER sandbox_bank_capacity BEFORE INSERT ON public.bank_account FOR EACH ROW EXECUTE FUNCTION st250_auth.guard_bank_growth();
CREATE POLICY sandbox_capacity_count ON public.raw_transaction FOR SELECT TO subtrack_sandbox_owner USING(true);
CREATE TRIGGER sandbox_bank_capacity BEFORE INSERT ON public.raw_transaction FOR EACH ROW EXECUTE FUNCTION st250_auth.guard_bank_growth();
CREATE POLICY sandbox_capacity_count ON st248_bank.receipt FOR SELECT TO subtrack_sandbox_owner USING(true);
CREATE TRIGGER sandbox_bank_capacity BEFORE INSERT ON st248_bank.receipt FOR EACH ROW EXECUTE FUNCTION st250_auth.guard_bank_growth();
CREATE POLICY sandbox_capacity_count ON st081_detection.candidate FOR SELECT TO subtrack_sandbox_owner USING(true);
CREATE TRIGGER sandbox_bank_capacity BEFORE INSERT ON st081_detection.candidate FOR EACH ROW EXECUTE FUNCTION st250_auth.guard_bank_growth();
CREATE POLICY sandbox_capacity_count ON st081_detection.source_link FOR SELECT TO subtrack_sandbox_owner USING(true);
CREATE TRIGGER sandbox_bank_capacity BEFORE INSERT ON st081_detection.source_link FOR EACH ROW EXECUTE FUNCTION st250_auth.guard_bank_growth();
CREATE POLICY sandbox_capacity_count ON st081_detection.scan_receipt FOR SELECT TO subtrack_sandbox_owner USING(true);
CREATE TRIGGER sandbox_bank_capacity BEFORE INSERT ON st081_detection.scan_receipt FOR EACH ROW EXECUTE FUNCTION st250_auth.guard_bank_growth();
CREATE POLICY sandbox_capacity_count ON st081_detection.review_receipt FOR SELECT TO subtrack_sandbox_owner USING(true);
CREATE TRIGGER sandbox_bank_capacity BEFORE INSERT ON st081_detection.review_receipt FOR EACH ROW EXECUTE FUNCTION st250_auth.guard_bank_growth();
CREATE POLICY sandbox_capacity_count ON st081_detection.feedback FOR SELECT TO subtrack_sandbox_owner USING(true);
CREATE TRIGGER sandbox_bank_capacity BEFORE INSERT ON st081_detection.feedback FOR EACH ROW EXECUTE FUNCTION st250_auth.guard_bank_growth();
INSERT INTO st250_auth.migration VALUES(3,current_setting('st250.bank_sha256'));
COMMIT;
