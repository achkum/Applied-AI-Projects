-- Additive isolated household profiles; no account, invitation or bank visibility authority.
BEGIN;
SET LOCAL search_path=pg_catalog;
SELECT 1/(current_database()='subtrack_sandbox' AND SESSION_USER='subtrack_sandbox_bootstrap' AND current_setting('server_version_num')::int BETWEEN 160000 AND 169999 AND EXISTS(SELECT 1 FROM st250_auth.epoch WHERE id='st250-sandbox-v1' AND manifest_h=current_setting('st250.manifest') AND active))::int;
CREATE TABLE public.household(id uuid PRIMARY KEY,name varchar(120) NOT NULL CHECK(char_length(name) BETWEEN 1 AND 80),created_by uuid NOT NULL UNIQUE REFERENCES public.identity(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),deleted_at timestamptz CHECK(deleted_at IS NULL),UNIQUE(id,created_by));
CREATE TABLE public.household_member(id uuid PRIMARY KEY,household_id uuid NOT NULL,identity_id uuid REFERENCES public.identity(id) ON DELETE RESTRICT,owner_identity_id uuid NOT NULL,display_name varchar(120),role varchar(16) NOT NULL CHECK(role IN('ADMIN','DEPENDANT')),joined_at timestamptz NOT NULL DEFAULT clock_timestamp(),left_at timestamptz,FOREIGN KEY(household_id,owner_identity_id) REFERENCES public.household(id,created_by) ON DELETE RESTRICT,CHECK((role='ADMIN' AND identity_id IS NOT NULL AND identity_id=owner_identity_id AND display_name IS NULL AND left_at IS NULL) OR (role='DEPENDANT' AND identity_id IS NULL AND display_name IS NOT NULL AND char_length(display_name) BETWEEN 1 AND 80)));
CREATE UNIQUE INDEX sandbox_household_one_admin ON public.household_member(household_id) WHERE role='ADMIN' AND left_at IS NULL;
CREATE UNIQUE INDEX sandbox_household_one_membership ON public.household_member(identity_id) WHERE identity_id IS NOT NULL AND left_at IS NULL;
CREATE UNIQUE INDEX sandbox_household_member_owner_key ON public.household_member(id,owner_identity_id);
CREATE TABLE public.household_subscription_plan(identity_id uuid NOT NULL,subscription_id uuid NOT NULL,payer_member_id uuid,PRIMARY KEY(identity_id,subscription_id),FOREIGN KEY(subscription_id,identity_id) REFERENCES public.subscription(id,identity_id) ON DELETE RESTRICT,FOREIGN KEY(payer_member_id,identity_id) REFERENCES public.household_member(id,owner_identity_id) ON DELETE RESTRICT);
CREATE TABLE public.household_subscription_usage(identity_id uuid NOT NULL,subscription_id uuid NOT NULL,member_id uuid NOT NULL,PRIMARY KEY(identity_id,subscription_id,member_id),FOREIGN KEY(identity_id,subscription_id) REFERENCES public.household_subscription_plan(identity_id,subscription_id) ON DELETE RESTRICT,FOREIGN KEY(member_id,identity_id) REFERENCES public.household_member(id,owner_identity_id) ON DELETE RESTRICT);
CREATE TABLE public.household_audit(ordinal bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor_id uuid NOT NULL REFERENCES public.identity(id) ON DELETE RESTRICT,event_type text NOT NULL CHECK(event_type IN('household_created','household_renamed','dependant_added','dependant_edited','dependant_removed','household_usage_changed')),target_id uuid NOT NULL,prev_hash text NOT NULL CHECK(prev_hash~'^[a-f0-9]{64}$'),hash text NOT NULL UNIQUE CHECK(hash~'^[a-f0-9]{64}$'),at timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE public.household OWNER TO subtrack_sandbox_owner;
ALTER TABLE public.household_member OWNER TO subtrack_sandbox_owner;
ALTER TABLE public.household_audit OWNER TO subtrack_sandbox_owner;
ALTER TABLE public.household_subscription_usage OWNER TO subtrack_sandbox_owner;
ALTER TABLE public.household_subscription_plan OWNER TO subtrack_sandbox_owner;
ALTER TABLE public.household ENABLE ROW LEVEL SECURITY;ALTER TABLE public.household FORCE ROW LEVEL SECURITY;
ALTER TABLE public.household_member ENABLE ROW LEVEL SECURITY;ALTER TABLE public.household_member FORCE ROW LEVEL SECURITY;
ALTER TABLE public.household_audit ENABLE ROW LEVEL SECURITY;ALTER TABLE public.household_audit FORCE ROW LEVEL SECURITY;
ALTER TABLE public.household_subscription_usage ENABLE ROW LEVEL SECURITY;ALTER TABLE public.household_subscription_usage FORCE ROW LEVEL SECURITY;
ALTER TABLE public.household_subscription_plan ENABLE ROW LEVEL SECURITY;ALTER TABLE public.household_subscription_plan FORCE ROW LEVEL SECURITY;
CREATE POLICY household_owner ON public.household TO subtrack_sandbox_runtime USING(public.subtrack_principal_matches(created_by)) WITH CHECK(public.subtrack_principal_matches(created_by));
CREATE POLICY household_member_owner_read ON public.household_member FOR SELECT TO subtrack_sandbox_runtime USING(public.subtrack_principal_matches(owner_identity_id));
CREATE POLICY household_member_owner_insert ON public.household_member FOR INSERT TO subtrack_sandbox_runtime WITH CHECK(public.subtrack_principal_matches(owner_identity_id));
CREATE POLICY household_member_dependant_update ON public.household_member FOR UPDATE TO subtrack_sandbox_runtime USING(public.subtrack_principal_matches(owner_identity_id) AND role='DEPENDANT') WITH CHECK(public.subtrack_principal_matches(owner_identity_id) AND role='DEPENDANT');
CREATE POLICY household_audit_owner ON public.household_audit TO subtrack_sandbox_runtime USING(public.subtrack_principal_matches(actor_id)) WITH CHECK(public.subtrack_principal_matches(actor_id));
CREATE POLICY household_usage_owner ON public.household_subscription_usage TO subtrack_sandbox_runtime USING(public.subtrack_principal_matches(identity_id)) WITH CHECK(public.subtrack_principal_matches(identity_id) AND EXISTS(SELECT 1 FROM public.household_member m WHERE m.id=household_subscription_usage.member_id AND m.owner_identity_id=household_subscription_usage.identity_id AND m.left_at IS NULL));
CREATE POLICY household_plan_owner ON public.household_subscription_plan TO subtrack_sandbox_runtime USING(public.subtrack_principal_matches(identity_id)) WITH CHECK(public.subtrack_principal_matches(identity_id) AND EXISTS(SELECT 1 FROM public.household h WHERE h.created_by=household_subscription_plan.identity_id AND h.deleted_at IS NULL) AND (payer_member_id IS NULL OR EXISTS(SELECT 1 FROM public.household_member m WHERE m.id=household_subscription_plan.payer_member_id AND m.owner_identity_id=household_subscription_plan.identity_id AND m.left_at IS NULL)));
CREATE FUNCTION st250_auth.household_growth() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME='household_member' THEN
  IF NOT public.subtrack_principal_matches(NEW.owner_identity_id) OR (SELECT count(*) FROM public.household_member WHERE owner_identity_id=NEW.owner_identity_id)>=80 OR (SELECT count(*) FROM public.household_member WHERE owner_identity_id=NEW.owner_identity_id AND left_at IS NULL)>=20 THEN RAISE EXCEPTION 'Household capacity unavailable' USING ERRCODE='P0250';END IF;
 ELSE
  IF NOT public.subtrack_principal_matches(NEW.actor_id) OR (SELECT count(*) FROM public.household_audit WHERE actor_id=NEW.actor_id)>=1000 THEN RAISE EXCEPTION 'Household capacity unavailable' USING ERRCODE='P0250';END IF;
 END IF;RETURN NEW;
END $$;
ALTER FUNCTION st250_auth.household_growth() OWNER TO subtrack_sandbox_owner;
REVOKE ALL ON FUNCTION st250_auth.household_growth() FROM PUBLIC;
CREATE TRIGGER sandbox_household_member_growth BEFORE INSERT ON public.household_member FOR EACH ROW EXECUTE FUNCTION st250_auth.household_growth();
CREATE TRIGGER sandbox_household_audit_growth BEFORE INSERT ON public.household_audit FOR EACH ROW EXECUTE FUNCTION st250_auth.household_growth();
REVOKE ALL ON public.household,public.household_member,public.household_audit,public.household_subscription_usage,public.household_subscription_plan FROM PUBLIC;
GRANT SELECT ON public.household,public.household_member,public.household_audit,public.household_subscription_usage,public.household_subscription_plan TO subtrack_sandbox_runtime;
GRANT INSERT(id,name,created_by) ON public.household TO subtrack_sandbox_runtime;
GRANT UPDATE(name,updated_at) ON public.household TO subtrack_sandbox_runtime;
GRANT INSERT(id,household_id,identity_id,owner_identity_id,display_name,role) ON public.household_member TO subtrack_sandbox_runtime;
GRANT UPDATE(display_name,left_at) ON public.household_member TO subtrack_sandbox_runtime;
GRANT INSERT(actor_id,event_type,target_id,prev_hash,hash) ON public.household_audit TO subtrack_sandbox_runtime;
GRANT USAGE ON SEQUENCE public.household_audit_ordinal_seq TO subtrack_sandbox_runtime;
GRANT INSERT,DELETE ON public.household_subscription_usage TO subtrack_sandbox_runtime;
GRANT INSERT ON public.household_subscription_plan TO subtrack_sandbox_runtime;
GRANT UPDATE(payer_member_id) ON public.household_subscription_plan TO subtrack_sandbox_runtime;
-- The forward banking migration expands the migration id constraint to 1..4.
INSERT INTO st250_auth.migration VALUES(4,current_setting('st250.household_sha256'));
COMMIT;
