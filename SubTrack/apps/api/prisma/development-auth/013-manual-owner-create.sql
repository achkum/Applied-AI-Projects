-- ST-240: append-only owner manual-create receipts on the qualified private PG16 profile.
-- Apply after pinned SQL001-012; subscription result references intentionally have no FK.
BEGIN;
SET LOCAL search_path = pg_catalog;
SELECT 1 / COALESCE((pg_catalog.current_database() = 'st237_private_https_profile'
  AND SESSION_USER = 'st233a_fixture_owner'
  AND pg_catalog.current_setting('server_version_num')::pg_catalog.int4 BETWEEN 160000 AND 169999
  AND EXISTS (SELECT 1 FROM public.st233a_fixture_control c WHERE c.task='ST-233a'
    AND c.head=pg_catalog.current_setting('st233a.head') AND c.marker=pg_catalog.current_setting('st233a.marker')
    AND c.marker ~ '^[a-f0-9]{32}$')
  AND pg_catalog.to_regclass('subtrack_auth.login_proof') IS NOT NULL
  AND pg_catalog.to_regclass('public.identity_profile') IS NOT NULL
  AND pg_catalog.to_regclass('public.manual_subscription_create_receipt') IS NULL
  AND (SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class
    WHERE oid='public.subscription'::pg_catalog.regclass)
),false)::pg_catalog.int4;
CREATE TABLE public.manual_subscription_create_receipt (
  identity_id pg_catalog.uuid NOT NULL,
  key_hash pg_catalog.bytea NOT NULL,
  request_hash pg_catalog.bytea NOT NULL,
  subscription_id pg_catalog.uuid NOT NULL,
  created_at pg_catalog.timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT manual_subscription_create_receipt_pkey PRIMARY KEY (identity_id,key_hash),
  CONSTRAINT manual_subscription_create_receipt_key_hash_check CHECK (pg_catalog.octet_length(key_hash)=32),
  CONSTRAINT manual_subscription_create_receipt_request_hash_check CHECK (pg_catalog.octet_length(request_hash)=32),
  CONSTRAINT manual_subscription_create_receipt_identity_id_fkey FOREIGN KEY (identity_id)
    REFERENCES public.identity(id) ON UPDATE RESTRICT ON DELETE CASCADE
);
REVOKE ALL ON public.manual_subscription_create_receipt FROM PUBLIC;
ALTER TABLE public.manual_subscription_create_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_subscription_create_receipt FORCE ROW LEVEL SECURITY;
CREATE POLICY manual_subscription_create_receipt_select ON public.manual_subscription_create_receipt
  FOR SELECT TO subtrack_runtime USING (public.subtrack_principal_matches(identity_id));
CREATE POLICY manual_subscription_create_receipt_insert ON public.manual_subscription_create_receipt
  FOR INSERT TO subtrack_runtime WITH CHECK (public.subtrack_principal_matches(identity_id));
GRANT SELECT,INSERT ON public.manual_subscription_create_receipt TO subtrack_runtime;
COMMIT;
