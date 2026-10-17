-- EVIDENCE ONLY: proposed disposable fixture 017. NOT a runtime migration.
BEGIN;
SET LOCAL search_path=pg_catalog;
SELECT 1/COALESCE((pg_catalog.current_database()='st237_private_https_profile'
 AND SESSION_USER='st233a_fixture_owner'
 AND pg_catalog.current_setting('server_version_num')::int4 BETWEEN 160000 AND 169999
 AND EXISTS(SELECT 1 FROM public.st233a_fixture_control c WHERE c.task='ST-233a'
 AND c.head=pg_catalog.current_setting('st233a.head')
 AND c.marker=pg_catalog.current_setting('st233a.marker') AND c.marker ~ '^[a-f0-9]{32}$')
 AND pg_catalog.to_regclass('st248_bank.generation') IS NOT NULL
 AND pg_catalog.to_regnamespace('st081_detection') IS NULL
 AND (SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class
 WHERE oid='public.subscription'::regclass)),false)::int4;
CREATE SCHEMA st081_detection AUTHORIZATION subtrack_auth_owner;
REVOKE ALL ON SCHEMA st081_detection FROM PUBLIC;
GRANT USAGE ON SCHEMA st081_detection TO subtrack_runtime;

CREATE TABLE st081_detection.candidate (
 identity_id uuid NOT NULL, subscription_id uuid NOT NULL,
 connection_id uuid NOT NULL, account_id uuid NOT NULL,
 merchant_key varchar(160) NOT NULL CHECK(length(merchant_key) BETWEEN 1 AND 160),
 currency char(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 cadence public.subscription_cadence NOT NULL CHECK(cadence<>'CUSTOM'),
 algorithm_version text NOT NULL CHECK(algorithm_version='recurring-bigint-v1'),
 candidate_h bytea NOT NULL CHECK(octet_length(candidate_h)=32),
 PRIMARY KEY(identity_id,subscription_id),
 UNIQUE(identity_id,connection_id,candidate_h),
 FOREIGN KEY(subscription_id,identity_id) REFERENCES public.subscription(id,identity_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 FOREIGN KEY(connection_id,identity_id) REFERENCES st248_bank.generation(connection_id,identity_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 FOREIGN KEY(account_id,identity_id) REFERENCES public.bank_account(id,identity_id) ON UPDATE RESTRICT ON DELETE RESTRICT);
CREATE TABLE st081_detection.source_link (
 identity_id uuid NOT NULL, subscription_id uuid NOT NULL, raw_transaction_id uuid NOT NULL,
 PRIMARY KEY(identity_id,subscription_id,raw_transaction_id),
 FOREIGN KEY(identity_id,subscription_id) REFERENCES st081_detection.candidate(identity_id,subscription_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 FOREIGN KEY(raw_transaction_id,identity_id) REFERENCES public.raw_transaction(id,identity_id) ON UPDATE RESTRICT ON DELETE RESTRICT);

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

ALTER TABLE st081_detection.candidate OWNER TO subtrack_auth_owner;
ALTER TABLE st081_detection.source_link OWNER TO subtrack_auth_owner;
ALTER TABLE st081_detection.review_receipt OWNER TO subtrack_auth_owner;
ALTER TABLE st081_detection.feedback OWNER TO subtrack_auth_owner;
ALTER TABLE st081_detection.scan_receipt OWNER TO subtrack_auth_owner;
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
CREATE POLICY candidate_owner ON st081_detection.candidate TO subtrack_runtime USING(public.subtrack_principal_matches(identity_id)) WITH CHECK(public.subtrack_principal_matches(identity_id));
CREATE POLICY source_link_owner ON st081_detection.source_link TO subtrack_runtime USING(public.subtrack_principal_matches(identity_id)) WITH CHECK(public.subtrack_principal_matches(identity_id));
CREATE POLICY review_receipt_owner ON st081_detection.review_receipt TO subtrack_runtime USING(public.subtrack_principal_matches(identity_id)) WITH CHECK(public.subtrack_principal_matches(identity_id));
CREATE POLICY feedback_owner ON st081_detection.feedback TO subtrack_runtime USING(public.subtrack_principal_matches(identity_id)) WITH CHECK(public.subtrack_principal_matches(identity_id));
CREATE POLICY scan_receipt_owner ON st081_detection.scan_receipt TO subtrack_runtime USING(public.subtrack_principal_matches(identity_id)) WITH CHECK(public.subtrack_principal_matches(identity_id));
GRANT SELECT,INSERT ON st081_detection.candidate,st081_detection.source_link,st081_detection.review_receipt,st081_detection.feedback,st081_detection.scan_receipt TO subtrack_runtime;
GRANT UPDATE(consumed_at) ON st081_detection.review_receipt TO subtrack_runtime;
GRANT UPDATE(superseded_by_event_id) ON st081_detection.feedback TO subtrack_runtime;
-- Candidate identity is immutable. Lock the existing subscription row in the
-- named candidate lock, under the authority's existing owner-identity lock;
-- no candidate UPDATE privilege is needed or proposed.
COMMIT;
