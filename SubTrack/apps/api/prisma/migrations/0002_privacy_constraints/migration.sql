-- BUG-008b: SQL-only constraints and least-privilege policy over the exact
-- Phase A Prisma 6.19.2 schema. No legacy migration is part of this chain.
-- Migration owner must be able to create the confined BYPASSRLS lookup role.
BEGIN;

CREATE UNIQUE INDEX household_member_active_membership_idx
  ON public.household_member(identity_id) WHERE left_at IS NULL;
CREATE UNIQUE INDEX subscription_share_active_household_idx
  ON public.subscription_share(subscription_id, household_id) WHERE revoked_at IS NULL;
CREATE INDEX invitation_token_hash_idx ON public.invitation(token_hash) WHERE token_hash IS NOT NULL;

ALTER TABLE public.subscription ADD CONSTRAINT subscription_confidence_range
  CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1);
ALTER TABLE public.raw_transaction ADD CONSTRAINT raw_transaction_original_pair
  CHECK ((original_amount_minor IS NULL) = (original_currency IS NULL));
ALTER TABLE public.subscription_charge ADD CONSTRAINT subscription_charge_match_pair
  CHECK ((raw_transaction_id IS NULL) = (matched_by IS NULL));

-- Captured charges use the transaction's signed minor units, currency and
-- provider transaction date when linked. Manual charges have independently
-- supplied source-backed values. No exchange-rate or date arithmetic occurs.
CREATE FUNCTION public.subtrack_charge_agreement() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE source_row record;
BEGIN
  IF NEW.raw_transaction_id IS NOT NULL THEN
    -- Write the source tuple without changing its values. This serializes
    -- concurrent source edits; repeatable-read writers get a write conflict.
    UPDATE public.raw_transaction SET updated_at = updated_at
      WHERE id = NEW.raw_transaction_id AND identity_id = NEW.identity_id
      RETURNING amount_minor, currency, transaction_date INTO source_row;
    IF NOT FOUND OR NEW.amount_minor IS DISTINCT FROM source_row.amount_minor
       OR NEW.currency IS DISTINCT FROM source_row.currency
       OR NEW.charged_at IS DISTINCT FROM source_row.transaction_date THEN
      RAISE EXCEPTION 'Linked charge values disagree with transaction';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER subscription_charge_agreement BEFORE INSERT OR UPDATE ON public.subscription_charge
  FOR EACH ROW EXECUTE FUNCTION public.subtrack_charge_agreement();

CREATE FUNCTION public.subtrack_linked_transaction_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF (NEW.amount_minor, NEW.currency, NEW.transaction_date)
     IS DISTINCT FROM (OLD.amount_minor, OLD.currency, OLD.transaction_date)
     AND EXISTS (SELECT 1 FROM public.subscription_charge WHERE raw_transaction_id = OLD.id) THEN
    RAISE EXCEPTION 'Linked transaction financial fields are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER raw_transaction_linked_values BEFORE UPDATE ON public.raw_transaction
  FOR EACH ROW EXECUTE FUNCTION public.subtrack_linked_transaction_immutable();

CREATE FUNCTION public.subtrack_membership_authority_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF (NEW.id, NEW.household_id, NEW.identity_id, NEW.joined_at)
     IS DISTINCT FROM (OLD.id, OLD.household_id, OLD.identity_id, OLD.joined_at)
     OR (OLD.left_at IS NOT NULL AND NEW.left_at IS NULL) THEN
    RAISE EXCEPTION 'Membership authority fields are immutable';
  END IF;
  IF OLD.role = 'ADMIN' AND OLD.left_at IS NULL
     AND (NEW.role <> 'ADMIN' OR NEW.left_at IS NOT NULL) THEN
    -- Write the common household row so concurrent admin departures serialize,
    -- including under repeatable-read isolation (one writer must retry).
    UPDATE public.household SET updated_at = updated_at WHERE id = OLD.household_id;
    IF NOT EXISTS (SELECT 1 FROM public.household_member m
       WHERE m.household_id = OLD.household_id AND m.id <> OLD.id
         AND m.role = 'ADMIN' AND m.left_at IS NULL) THEN
      RAISE EXCEPTION 'Last active administrator cannot leave';
    END IF;
  END IF;
  IF NOT public.subtrack_active_admin(OLD.household_id)
     AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.left_at IS NULL
       OR OLD.identity_id IS DISTINCT FROM public.subtrack_principal()) THEN
    RAISE EXCEPTION 'Member may only leave their own membership';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER household_member_authority BEFORE UPDATE ON public.household_member
  FOR EACH ROW EXECUTE FUNCTION public.subtrack_membership_authority_immutable();

CREATE FUNCTION public.subtrack_immutable_owner() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.identity_id IS DISTINCT FROM OLD.identity_id THEN
    RAISE EXCEPTION 'Owner identity is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bank_connection_owner_immutable BEFORE UPDATE ON public.bank_connection FOR EACH ROW EXECUTE FUNCTION public.subtrack_immutable_owner();
CREATE TRIGGER bank_account_owner_immutable BEFORE UPDATE ON public.bank_account FOR EACH ROW EXECUTE FUNCTION public.subtrack_immutable_owner();
CREATE TRIGGER raw_transaction_owner_immutable BEFORE UPDATE ON public.raw_transaction FOR EACH ROW EXECUTE FUNCTION public.subtrack_immutable_owner();
CREATE TRIGGER subscription_owner_immutable BEFORE UPDATE ON public.subscription FOR EACH ROW EXECUTE FUNCTION public.subtrack_immutable_owner();
CREATE TRIGGER subscription_charge_owner_immutable BEFORE UPDATE ON public.subscription_charge FOR EACH ROW EXECUTE FUNCTION public.subtrack_immutable_owner();
CREATE TRIGGER consent_owner_immutable BEFORE UPDATE ON public.consent FOR EACH ROW EXECUTE FUNCTION public.subtrack_immutable_owner();
CREATE TRIGGER session_owner_immutable BEFORE UPDATE ON public.session FOR EACH ROW EXECUTE FUNCTION public.subtrack_immutable_owner();

CREATE FUNCTION public.subtrack_share_revoke_only() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF (NEW.id, NEW.subscription_id, NEW.household_id, NEW.shared_by, NEW.shared_at)
     IS DISTINCT FROM (OLD.id, OLD.subscription_id, OLD.household_id, OLD.shared_by, OLD.shared_at)
     OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL THEN
    RAISE EXCEPTION 'Share update must only revoke the original grant';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER subscription_share_revoke_only BEFORE UPDATE ON public.subscription_share
  FOR EACH ROW EXECUTE FUNCTION public.subtrack_share_revoke_only();

CREATE FUNCTION public.subtrack_invitation_revoke_only() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF (NEW.id, NEW.household_id, NEW.inviter_id, NEW.invitee_id, NEW.channel,
      NEW.recipient, NEW.token_hash, NEW.expires_at, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.household_id, OLD.inviter_id, OLD.invitee_id, OLD.channel,
      OLD.recipient, OLD.token_hash, OLD.expires_at, OLD.created_at)
     OR OLD.status <> 'PENDING' OR NEW.status <> 'REVOKED' THEN
    IF NOT pg_catalog.pg_has_role(current_user, 'subtrack_invitation_service', 'USAGE')
       OR (NEW.id, NEW.household_id, NEW.inviter_id, NEW.channel,
           NEW.recipient, NEW.token_hash, NEW.expires_at, NEW.created_at)
          IS DISTINCT FROM (OLD.id, OLD.household_id, OLD.inviter_id, OLD.channel,
           OLD.recipient, OLD.token_hash, OLD.expires_at, OLD.created_at)
       OR OLD.status <> 'PENDING'
       OR NEW.status NOT IN ('ACCEPTED', 'DECLINED', 'EXPIRED')
       OR (NEW.status IN ('ACCEPTED', 'DECLINED') AND
           (NEW.invitee_id IS NULL OR OLD.expires_at <= now()))
       OR (NEW.status = 'EXPIRED' AND NEW.invitee_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Invitation transition is forbidden';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invitation_revoke_only BEFORE UPDATE ON public.invitation
  FOR EACH ROW EXECUTE FUNCTION public.subtrack_invitation_revoke_only();

-- A household is never committed without its first active administrator.
-- The accepted create flow inserts household and first member in one transaction.
CREATE FUNCTION public.subtrack_household_has_admin() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.household_member m
      WHERE m.household_id = NEW.id AND m.role = 'ADMIN' AND m.left_at IS NULL) THEN
    RAISE EXCEPTION 'Household requires an active administrator';
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER household_first_admin AFTER INSERT ON public.household
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.subtrack_household_has_admin();

CREATE ROLE subtrack_runtime NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
CREATE ROLE subtrack_catalogue_writer NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
CREATE ROLE subtrack_otp_service NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
CREATE ROLE subtrack_invitation_service NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
CREATE ROLE subtrack_identity_provisioner NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
CREATE ROLE subtrack_visibility_lookup NOLOGIN NOINHERIT NOSUPERUSER BYPASSRLS;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO subtrack_runtime, subtrack_catalogue_writer,
  subtrack_otp_service, subtrack_invitation_service, subtrack_identity_provisioner,
  subtrack_visibility_lookup;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

-- Exact columns used by the four Boolean lookup decisions. This role owns no
-- protected table; no LOGIN, runtime membership or schema CREATE is granted.
GRANT SELECT(id, deleted_at) ON public.identity TO subtrack_visibility_lookup;
GRANT SELECT(household_id, identity_id, left_at, role) ON public.household_member TO subtrack_visibility_lookup;
GRANT SELECT(identity_id, scope_id, scope_type, open_book) ON public.consent TO subtrack_visibility_lookup;
GRANT SELECT(id, identity_id, always_private) ON public.subscription TO subtrack_visibility_lookup;
GRANT SELECT(subscription_id, household_id, revoked_at) ON public.subscription_share TO subtrack_visibility_lookup;

-- This private parser is only callable inside lookup-owned functions. Both
-- accepted BUG-013 transaction-local keys must be identical, valid UUIDs and
-- name a live identity; missing/malformed/mismatched context returns NULL.
CREATE FUNCTION public.subtrack_principal() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT i.id FROM public.identity i
  WHERE i.id = CASE
    WHEN current_setting('app.user_id', true) = current_setting('app.current_user_id', true)
     AND current_setting('app.user_id', true) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN current_setting('app.user_id', true)::uuid END
    AND i.deleted_at IS NULL
$$;
ALTER FUNCTION public.subtrack_principal() OWNER TO subtrack_visibility_lookup;
REVOKE ALL ON FUNCTION public.subtrack_principal() FROM PUBLIC;

CREATE FUNCTION public.subtrack_principal_matches(target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT COALESCE(target = public.subtrack_principal(), false)
$$;
ALTER FUNCTION public.subtrack_principal_matches(uuid) OWNER TO subtrack_visibility_lookup;

CREATE FUNCTION public.subtrack_authenticated() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT public.subtrack_principal() IS NOT NULL
$$;
ALTER FUNCTION public.subtrack_authenticated() OWNER TO subtrack_visibility_lookup;

CREATE FUNCTION public.subtrack_active_member(target_household uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM public.household_member m
    WHERE m.household_id = target_household AND m.identity_id = public.subtrack_principal()
      AND m.left_at IS NULL)
$$;
ALTER FUNCTION public.subtrack_active_member(uuid) OWNER TO subtrack_visibility_lookup;

CREATE FUNCTION public.subtrack_active_admin(target_household uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM public.household_member m
    WHERE m.household_id = target_household AND m.identity_id = public.subtrack_principal()
      AND m.left_at IS NULL AND m.role = 'ADMIN')
$$;
ALTER FUNCTION public.subtrack_active_admin(uuid) OWNER TO subtrack_visibility_lookup;

CREATE FUNCTION public.subtrack_empty_household(target_household uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.household_member m WHERE m.household_id = target_household)
$$;
ALTER FUNCTION public.subtrack_empty_household(uuid) OWNER TO subtrack_visibility_lookup;

CREATE FUNCTION public.subtrack_owns_subscription(target_subscription uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM public.subscription s
    WHERE s.id = target_subscription AND s.identity_id = public.subtrack_principal())
$$;
ALTER FUNCTION public.subtrack_owns_subscription(uuid) OWNER TO subtrack_visibility_lookup;

CREATE FUNCTION public.subtrack_can_view_subscription(target_subscription uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM public.subscription s
    WHERE s.id = target_subscription AND (s.identity_id = public.subtrack_principal()
      OR EXISTS (SELECT 1 FROM public.subscription_share sh
        JOIN public.household_member viewer ON viewer.household_id = sh.household_id
        WHERE sh.subscription_id = s.id AND sh.revoked_at IS NULL
          AND viewer.identity_id = public.subtrack_principal() AND viewer.left_at IS NULL)
      OR (NOT s.always_private AND EXISTS (
        SELECT 1 FROM public.household_member owner_member
        JOIN public.household_member viewer ON viewer.household_id = owner_member.household_id
        JOIN public.consent c ON c.identity_id = owner_member.identity_id
          AND c.scope_id = owner_member.household_id AND c.scope_type = 'HOUSEHOLD'
        WHERE owner_member.identity_id = s.identity_id AND owner_member.left_at IS NULL
          AND viewer.identity_id = public.subtrack_principal() AND viewer.left_at IS NULL
          AND c.open_book))) )
$$;
ALTER FUNCTION public.subtrack_can_view_subscription(uuid) OWNER TO subtrack_visibility_lookup;
REVOKE ALL ON FUNCTION public.subtrack_authenticated(), public.subtrack_principal_matches(uuid), public.subtrack_active_member(uuid),
  public.subtrack_active_admin(uuid), public.subtrack_empty_household(uuid), public.subtrack_owns_subscription(uuid),
  public.subtrack_can_view_subscription(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subtrack_authenticated(), public.subtrack_principal_matches(uuid), public.subtrack_active_member(uuid),
  public.subtrack_active_admin(uuid), public.subtrack_empty_household(uuid), public.subtrack_owns_subscription(uuid),
  public.subtrack_can_view_subscription(uuid) TO subtrack_runtime;

ALTER TABLE public.identity ENABLE ROW LEVEL SECURITY;
CREATE POLICY identity_select ON public.identity FOR SELECT TO subtrack_runtime USING (public.subtrack_principal_matches(id));
CREATE POLICY identity_insert ON public.identity FOR INSERT TO subtrack_runtime WITH CHECK (public.subtrack_principal_matches(id));
CREATE POLICY identity_update ON public.identity FOR UPDATE TO subtrack_runtime USING (public.subtrack_principal_matches(id)) WITH CHECK (public.subtrack_principal_matches(id));
CREATE POLICY identity_delete ON public.identity FOR DELETE TO subtrack_runtime USING (public.subtrack_principal_matches(id));
-- Provider-verified registration needs an identity row before either request
-- context key can name a live principal. This role has no ordinary membership.
CREATE POLICY identity_provisioner_select ON public.identity FOR SELECT TO subtrack_identity_provisioner USING (true);
CREATE POLICY identity_provisioner_insert ON public.identity FOR INSERT TO subtrack_identity_provisioner WITH CHECK (true);

ALTER TABLE public.household ENABLE ROW LEVEL SECURITY;
-- INSERT RETURNING needs SELECT before the first member is added. An empty
-- household is visible only inside its creating transaction: the deferred
-- constraint rejects commit until its first admin exists.
CREATE POLICY household_select ON public.household FOR SELECT TO subtrack_runtime USING (
  public.subtrack_active_member(id) OR
  (public.subtrack_authenticated() AND public.subtrack_empty_household(id)));
CREATE POLICY household_insert ON public.household FOR INSERT TO subtrack_runtime WITH CHECK (public.subtrack_authenticated());
CREATE POLICY household_update ON public.household FOR UPDATE TO subtrack_runtime USING (public.subtrack_active_admin(id)) WITH CHECK (public.subtrack_active_admin(id));
CREATE POLICY household_delete ON public.household FOR DELETE TO subtrack_runtime USING (public.subtrack_active_admin(id));

ALTER TABLE public.household_member ENABLE ROW LEVEL SECURITY;
CREATE POLICY member_select ON public.household_member FOR SELECT TO subtrack_runtime USING (public.subtrack_active_member(household_id));
CREATE POLICY member_insert ON public.household_member FOR INSERT TO subtrack_runtime WITH CHECK (
  public.subtrack_active_admin(household_id)
  OR (role = 'ADMIN' AND public.subtrack_principal_matches(identity_id)
      AND public.subtrack_empty_household(household_id)));
CREATE POLICY member_update ON public.household_member FOR UPDATE TO subtrack_runtime USING (
  public.subtrack_active_admin(household_id) OR public.subtrack_principal_matches(identity_id))
  WITH CHECK (public.subtrack_active_admin(household_id) OR public.subtrack_principal_matches(identity_id));
CREATE POLICY member_service_select ON public.household_member FOR SELECT TO subtrack_invitation_service USING (true);
CREATE POLICY member_service_accept ON public.household_member FOR INSERT TO subtrack_invitation_service
  WITH CHECK (role = 'MEMBER' AND EXISTS (SELECT 1 FROM public.invitation i
    WHERE i.household_id = household_member.household_id AND i.invitee_id = household_member.identity_id
      AND i.status = 'ACCEPTED' AND i.expires_at > now()));

ALTER TABLE public.invitation ENABLE ROW LEVEL SECURITY;
CREATE POLICY invitation_select ON public.invitation FOR SELECT TO subtrack_runtime USING (
  public.subtrack_principal_matches(inviter_id) OR public.subtrack_principal_matches(invitee_id)
  OR public.subtrack_active_admin(household_id));
CREATE POLICY invitation_insert ON public.invitation FOR INSERT TO subtrack_runtime WITH CHECK (
  public.subtrack_principal_matches(inviter_id) AND public.subtrack_active_admin(household_id)
  AND status = 'PENDING');
CREATE POLICY invitation_update ON public.invitation FOR UPDATE TO subtrack_runtime USING (
  public.subtrack_principal_matches(inviter_id) OR public.subtrack_active_admin(household_id)) WITH CHECK (
  public.subtrack_principal_matches(inviter_id) OR public.subtrack_active_admin(household_id));
CREATE POLICY invitation_service_select ON public.invitation FOR SELECT TO subtrack_invitation_service USING (true);
CREATE POLICY invitation_service_update ON public.invitation FOR UPDATE TO subtrack_invitation_service
  USING (status = 'PENDING') WITH CHECK (status IN ('ACCEPTED','DECLINED','EXPIRED','REVOKED'));

ALTER TABLE public.consent ENABLE ROW LEVEL SECURITY;
CREATE POLICY consent_select ON public.consent FOR SELECT TO subtrack_runtime USING (public.subtrack_principal_matches(identity_id));
CREATE POLICY consent_insert ON public.consent FOR INSERT TO subtrack_runtime WITH CHECK (public.subtrack_principal_matches(identity_id));
CREATE POLICY consent_update ON public.consent FOR UPDATE TO subtrack_runtime USING (public.subtrack_principal_matches(identity_id)) WITH CHECK (public.subtrack_principal_matches(identity_id));
CREATE POLICY consent_delete ON public.consent FOR DELETE TO subtrack_runtime USING (public.subtrack_principal_matches(identity_id));

ALTER TABLE public.session ENABLE ROW LEVEL SECURITY;
CREATE POLICY session_select ON public.session FOR SELECT TO subtrack_runtime USING (public.subtrack_principal_matches(identity_id));
CREATE POLICY session_insert ON public.session FOR INSERT TO subtrack_runtime WITH CHECK (public.subtrack_principal_matches(identity_id));
CREATE POLICY session_update ON public.session FOR UPDATE TO subtrack_runtime USING (public.subtrack_principal_matches(identity_id)) WITH CHECK (public.subtrack_principal_matches(identity_id));

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_select ON public.audit_log FOR SELECT TO subtrack_runtime USING (public.subtrack_principal_matches(actor_id));
CREATE POLICY audit_insert ON public.audit_log FOR INSERT TO subtrack_runtime WITH CHECK (public.subtrack_principal_matches(actor_id));
CREATE POLICY audit_invitation_service_insert ON public.audit_log FOR INSERT TO subtrack_invitation_service
  WITH CHECK (event_type IN ('INVITATION_ACCEPTED','INVITATION_DECLINED')
    AND EXISTS (SELECT 1 FROM public.invitation i WHERE i.id = (payload->>'invitationId')::uuid
      AND i.invitee_id = actor_id AND i.household_id = household_id));

ALTER TABLE public.subscription ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscription_select ON public.subscription FOR SELECT TO subtrack_runtime USING (public.subtrack_can_view_subscription(id));
CREATE POLICY subscription_insert ON public.subscription FOR INSERT TO subtrack_runtime WITH CHECK (public.subtrack_principal_matches(identity_id));
CREATE POLICY subscription_update ON public.subscription FOR UPDATE TO subtrack_runtime USING (public.subtrack_principal_matches(identity_id)) WITH CHECK (public.subtrack_principal_matches(identity_id));
CREATE POLICY subscription_delete ON public.subscription FOR DELETE TO subtrack_runtime USING (public.subtrack_principal_matches(identity_id));

ALTER TABLE public.subscription_share ENABLE ROW LEVEL SECURITY;
CREATE POLICY share_select ON public.subscription_share FOR SELECT TO subtrack_runtime USING (
  public.subtrack_owns_subscription(subscription_id)
  OR (revoked_at IS NULL AND public.subtrack_active_member(household_id)));
CREATE POLICY share_insert ON public.subscription_share FOR INSERT TO subtrack_runtime WITH CHECK (
  public.subtrack_principal_matches(shared_by) AND public.subtrack_owns_subscription(subscription_id)
  AND public.subtrack_active_member(household_id) AND revoked_at IS NULL);
CREATE POLICY share_revoke ON public.subscription_share FOR UPDATE TO subtrack_runtime USING (
  public.subtrack_owns_subscription(subscription_id) AND revoked_at IS NULL)
  WITH CHECK (public.subtrack_owns_subscription(subscription_id) AND revoked_at IS NOT NULL);

-- Banking and charge detail never inherit subscription household visibility.
ALTER TABLE public.bank_connection ENABLE ROW LEVEL SECURITY;
CREATE POLICY bank_connection_select ON public.bank_connection FOR SELECT TO subtrack_runtime USING (public.subtrack_principal_matches(identity_id));
CREATE POLICY bank_connection_insert ON public.bank_connection FOR INSERT TO subtrack_runtime WITH CHECK (public.subtrack_principal_matches(identity_id));
CREATE POLICY bank_connection_update ON public.bank_connection FOR UPDATE TO subtrack_runtime USING (public.subtrack_principal_matches(identity_id)) WITH CHECK (public.subtrack_principal_matches(identity_id));
CREATE POLICY bank_connection_delete ON public.bank_connection FOR DELETE TO subtrack_runtime USING (public.subtrack_principal_matches(identity_id));

ALTER TABLE public.bank_account ENABLE ROW LEVEL SECURITY;
CREATE POLICY bank_account_select ON public.bank_account FOR SELECT TO subtrack_runtime USING (public.subtrack_principal_matches(identity_id));
CREATE POLICY bank_account_insert ON public.bank_account FOR INSERT TO subtrack_runtime WITH CHECK (public.subtrack_principal_matches(identity_id));
CREATE POLICY bank_account_update ON public.bank_account FOR UPDATE TO subtrack_runtime USING (public.subtrack_principal_matches(identity_id)) WITH CHECK (public.subtrack_principal_matches(identity_id));
CREATE POLICY bank_account_delete ON public.bank_account FOR DELETE TO subtrack_runtime USING (public.subtrack_principal_matches(identity_id));

ALTER TABLE public.raw_transaction ENABLE ROW LEVEL SECURITY;
CREATE POLICY raw_transaction_select ON public.raw_transaction FOR SELECT TO subtrack_runtime USING (public.subtrack_principal_matches(identity_id));
CREATE POLICY raw_transaction_insert ON public.raw_transaction FOR INSERT TO subtrack_runtime WITH CHECK (public.subtrack_principal_matches(identity_id));
CREATE POLICY raw_transaction_update ON public.raw_transaction FOR UPDATE TO subtrack_runtime USING (public.subtrack_principal_matches(identity_id)) WITH CHECK (public.subtrack_principal_matches(identity_id));
CREATE POLICY raw_transaction_delete ON public.raw_transaction FOR DELETE TO subtrack_runtime USING (public.subtrack_principal_matches(identity_id));

ALTER TABLE public.subscription_charge ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscription_charge_select ON public.subscription_charge FOR SELECT TO subtrack_runtime USING (public.subtrack_principal_matches(identity_id));
CREATE POLICY subscription_charge_insert ON public.subscription_charge FOR INSERT TO subtrack_runtime WITH CHECK (public.subtrack_principal_matches(identity_id));
CREATE POLICY subscription_charge_update ON public.subscription_charge FOR UPDATE TO subtrack_runtime USING (public.subtrack_principal_matches(identity_id)) WITH CHECK (public.subtrack_principal_matches(identity_id));
CREATE POLICY subscription_charge_delete ON public.subscription_charge FOR DELETE TO subtrack_runtime USING (public.subtrack_principal_matches(identity_id));

CREATE POLICY household_invitation_service_select ON public.household FOR SELECT TO subtrack_invitation_service USING (true);
CREATE POLICY identity_invitation_service_select ON public.identity FOR SELECT TO subtrack_invitation_service USING (true);

-- Grant only after all constraints, functions and policies exist. The migration
-- transaction prevents any intermediate schema from becoming visible.
GRANT SELECT ON public.merchant, public.catalogue_plan TO subtrack_runtime, subtrack_catalogue_writer;
GRANT INSERT, UPDATE, DELETE ON public.merchant, public.catalogue_plan TO subtrack_catalogue_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.identity, public.household,
  public.consent, public.bank_connection, public.bank_account, public.raw_transaction,
  public.subscription, public.subscription_charge TO subtrack_runtime;
GRANT SELECT, INSERT, UPDATE ON public.household_member TO subtrack_runtime;
GRANT SELECT, INSERT ON public.invitation TO subtrack_runtime;
GRANT UPDATE(status, updated_at) ON public.invitation TO subtrack_runtime;
GRANT SELECT, INSERT, UPDATE ON public.session TO subtrack_runtime;
GRANT SELECT, INSERT ON public.audit_log, public.subscription_share TO subtrack_runtime;
GRANT UPDATE(revoked_at) ON public.subscription_share TO subtrack_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.otp_challenge TO subtrack_otp_service;
GRANT SELECT(id, external_id), INSERT ON public.identity TO subtrack_identity_provisioner;
GRANT SELECT ON public.invitation, public.household, public.household_member TO subtrack_invitation_service;
GRANT SELECT(id, email, phone) ON public.identity TO subtrack_invitation_service;
GRANT UPDATE(status, invitee_id, updated_at) ON public.invitation TO subtrack_invitation_service;
GRANT INSERT ON public.household_member, public.audit_log TO subtrack_invitation_service;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subtrack_authenticated(), public.subtrack_principal_matches(uuid),
  public.subtrack_active_member(uuid), public.subtrack_active_admin(uuid),
  public.subtrack_empty_household(uuid), public.subtrack_owns_subscription(uuid),
  public.subtrack_can_view_subscription(uuid) TO subtrack_runtime;

COMMIT;
