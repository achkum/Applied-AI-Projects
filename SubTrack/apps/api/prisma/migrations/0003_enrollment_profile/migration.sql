-- ST-237 ordinary business migration. Install only after 0001 and 0002;
-- the qualified development-auth SQL010 is a separate database path.
ALTER TABLE public.identity
  ADD COLUMN verified_at pg_catalog.timestamptz,
  ADD COLUMN given_name pg_catalog.varchar(120),
  ADD COLUMN surname pg_catalog.varchar(120);
CREATE TABLE public.identity_profile (
  identity_id pg_catalog.uuid PRIMARY KEY REFERENCES public.identity(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  display_name pg_catalog.varchar(120), avatar_color pg_catalog.varchar(32), avatar_emoji pg_catalog.varchar(32),
  language pg_catalog.varchar(2) NOT NULL DEFAULT 'en' CHECK (language IN ('sv','en')),
  theme pg_catalog.varchar(16) NOT NULL DEFAULT 'system' CHECK (theme IN ('system','light','dark')),
  default_currency pg_catalog.bpchar(3) NOT NULL DEFAULT 'SEK' CHECK (default_currency='SEK'),
  profile_complete pg_catalog.bool NOT NULL DEFAULT false,
  created_at pg_catalog.timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at pg_catalog.timestamptz NOT NULL DEFAULT pg_catalog.now()
);
REVOKE ALL ON public.identity_profile FROM PUBLIC;
ALTER TABLE public.identity_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.identity_profile FORCE ROW LEVEL SECURITY;
CREATE POLICY identity_profile_select ON public.identity_profile FOR SELECT TO subtrack_runtime
  USING (public.subtrack_principal_matches(identity_id));
CREATE POLICY identity_profile_insert ON public.identity_profile FOR INSERT TO subtrack_runtime
  WITH CHECK (public.subtrack_principal_matches(identity_id));
CREATE POLICY identity_profile_update ON public.identity_profile FOR UPDATE TO subtrack_runtime
  USING (public.subtrack_principal_matches(identity_id)) WITH CHECK (public.subtrack_principal_matches(identity_id));
GRANT SELECT,INSERT ON public.identity_profile TO subtrack_runtime;
GRANT UPDATE(display_name,avatar_color,avatar_emoji,language,theme,default_currency,profile_complete,updated_at)
  ON public.identity_profile TO subtrack_runtime;
