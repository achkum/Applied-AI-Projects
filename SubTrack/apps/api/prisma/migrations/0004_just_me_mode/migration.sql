-- ST-238: the owner must choose Just me explicitly after completing a profile.
ALTER TABLE public.identity_profile
  ADD COLUMN onboarding_mode pg_catalog.varchar(16) DEFAULT NULL,
  ADD CONSTRAINT identity_profile_onboarding_mode_check
    CHECK (onboarding_mode IS NULL OR onboarding_mode = 'just-me');
GRANT UPDATE(onboarding_mode) ON public.identity_profile TO subtrack_runtime;

-- The existing owner and peer policies remain intact. FORCE also applies
-- those policies when a table owner reaches this relation.
ALTER TABLE public.subscription FORCE ROW LEVEL SECURITY;
