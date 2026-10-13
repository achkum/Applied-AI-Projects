-- ST-241: qualified private PG16 revisions and immutable owner edit receipts.
-- Existing writers inherit revision invalidation without new writer privileges.
BEGIN;
SET LOCAL search_path = pg_catalog;
SELECT 1 / COALESCE((pg_catalog.current_database() = 'st237_private_https_profile'
  AND SESSION_USER = 'st233a_fixture_owner'
  AND pg_catalog.current_setting('server_version_num')::pg_catalog.int4 BETWEEN 160000 AND 169999
  AND EXISTS (SELECT 1 FROM public.st233a_fixture_control c WHERE c.task='ST-233a'
    AND c.head=pg_catalog.current_setting('st233a.head') AND c.marker=pg_catalog.current_setting('st233a.marker')
    AND c.marker ~ '^[a-f0-9]{32}$')
  AND pg_catalog.to_regclass('public.manual_subscription_create_receipt') IS NOT NULL
  AND pg_catalog.to_regclass('public.manual_subscription_edit_receipt') IS NULL
  AND (SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class
    WHERE oid='public.subscription'::pg_catalog.regclass)
),false)::pg_catalog.int4;
ALTER TABLE public.subscription ADD COLUMN revision pg_catalog.int8 NOT NULL DEFAULT 1;
ALTER TABLE public.subscription ADD CONSTRAINT subscription_revision_check CHECK (revision > 0);
CREATE FUNCTION public.subtrack_subscription_revision() RETURNS pg_catalog.trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $revision$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.revision := 1::pg_catalog.int8;
  ELSE
    IF OLD.revision = 9223372036854775807::pg_catalog.int8 THEN
      RAISE EXCEPTION USING ERRCODE = '22003', MESSAGE = 'subscription revision overflow';
    END IF;
    NEW.revision := OLD.revision + 1::pg_catalog.int8;
  END IF;
  RETURN NEW;
END;
$revision$;
REVOKE ALL ON FUNCTION public.subtrack_subscription_revision() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subtrack_subscription_revision() TO subtrack_runtime;
CREATE TRIGGER subscription_revision_before_write BEFORE INSERT OR UPDATE ON public.subscription
FOR EACH ROW EXECUTE FUNCTION public.subtrack_subscription_revision();
CREATE TABLE public.manual_subscription_edit_receipt (
  identity_id pg_catalog.uuid NOT NULL,
  key_hash pg_catalog.bytea NOT NULL,
  request_hash pg_catalog.bytea NOT NULL,
  subscription_id pg_catalog.uuid NOT NULL,
  result_revision pg_catalog.int8 NOT NULL,
  created_at pg_catalog.timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT manual_subscription_edit_receipt_pkey PRIMARY KEY (identity_id,key_hash),
  CONSTRAINT manual_subscription_edit_receipt_key_hash_check CHECK (pg_catalog.octet_length(key_hash)=32),
  CONSTRAINT manual_subscription_edit_receipt_request_hash_check CHECK (pg_catalog.octet_length(request_hash)=32),
  CONSTRAINT manual_subscription_edit_receipt_result_revision_check CHECK (result_revision > 0),
  CONSTRAINT manual_subscription_edit_receipt_identity_id_fkey FOREIGN KEY (identity_id)
    REFERENCES public.identity(id) ON UPDATE RESTRICT ON DELETE CASCADE
);
REVOKE ALL ON public.manual_subscription_edit_receipt FROM PUBLIC;
ALTER TABLE public.manual_subscription_edit_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_subscription_edit_receipt FORCE ROW LEVEL SECURITY;
CREATE POLICY manual_subscription_edit_receipt_select ON public.manual_subscription_edit_receipt
  FOR SELECT TO subtrack_runtime USING (public.subtrack_principal_matches(identity_id));
CREATE POLICY manual_subscription_edit_receipt_insert ON public.manual_subscription_edit_receipt
  FOR INSERT TO subtrack_runtime WITH CHECK (public.subtrack_principal_matches(identity_id));
GRANT SELECT,INSERT ON public.manual_subscription_edit_receipt TO subtrack_runtime;
COMMIT;
