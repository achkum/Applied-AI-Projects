/** These are the only business statements installed in the private current-web authority. */
export const PRIVATE_PROFILE_STATEMENTS = Object.freeze({
  profileRead: `SELECT display_name, avatar_color, avatar_emoji, language, theme, default_currency, profile_complete
FROM public.identity_profile
WHERE identity_id = $1::uuid`,
  profilePatch: `UPDATE public.identity_profile AS p
SET display_name = CASE WHEN $2::boolean THEN $3::varchar(120) ELSE p.display_name END,
    avatar_color = CASE WHEN $4::boolean THEN $5::varchar(32) ELSE p.avatar_color END,
    avatar_emoji = CASE WHEN $6::boolean THEN $7::varchar(32) ELSE p.avatar_emoji END,
    language = CASE WHEN $8::boolean THEN $9::varchar(2) ELSE p.language END,
    theme = CASE WHEN $10::boolean THEN $11::varchar(16) ELSE p.theme END,
    profile_complete = (CASE WHEN $2::boolean THEN $3::varchar(120) ELSE p.display_name END IS NOT NULL),
    updated_at = pg_catalog.clock_timestamp()
WHERE p.identity_id = $1::uuid
RETURNING p.display_name, p.avatar_color, p.avatar_emoji, p.language, p.theme,
          p.default_currency, p.profile_complete`,
});
