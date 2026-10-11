-- ST-238 qualified successor. Install after pinned SQL010 and business 0001/0002.
-- This file changes only the new mode column/grant and subscription FORCE bit.
BEGIN;
SET LOCAL search_path = pg_catalog;
ALTER TABLE public.identity_profile
  ADD COLUMN onboarding_mode pg_catalog.varchar(16) DEFAULT NULL,
  ADD CONSTRAINT identity_profile_onboarding_mode_check
    CHECK (onboarding_mode IS NULL OR onboarding_mode = 'just-me');
GRANT UPDATE(onboarding_mode) ON public.identity_profile TO subtrack_runtime;
ALTER TABLE public.subscription FORCE ROW LEVEL SECURITY;
COMMIT;
