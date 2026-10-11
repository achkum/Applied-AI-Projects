/** Fixed, quote-free statements installed only by the private HTTPS composition. */
const OWNER_COLUMNS = `s.id::text AS id, s.identity_id::text AS identity_id,
  s.merchant_id::text AS merchant_id, m.canonical_name AS merchant_name,
  s.custom_name, s.category_code, s.cadence::text AS cadence,
  s.status::text AS status, s.expected_amount_minor::text AS expected_amount_minor,
  s.currency, s.next_charge_date::text AS next_charge_date,
  s.always_private,
  pg_catalog.to_char(s.created_at AT TIME ZONE $4::text, $5::text) AS created_at`;

export const PRIVATE_ONBOARDING_STATEMENTS = Object.freeze({
  modeRead: `SELECT onboarding_mode, profile_complete FROM public.identity_profile
WHERE identity_id = $1::uuid`,
  modeChoose: `UPDATE public.identity_profile
SET onboarding_mode = $2::varchar(16), updated_at = pg_catalog.clock_timestamp()
WHERE identity_id = $1::uuid AND profile_complete = true AND onboarding_mode IS NULL
RETURNING onboarding_mode`,
  ownerList: `SELECT ${OWNER_COLUMNS} FROM public.subscription AS s
LEFT JOIN public.merchant AS m ON m.id = s.merchant_id
WHERE s.identity_id = $1::uuid
  AND ($2::timestamptz IS NULL OR (s.created_at, s.id) < ($2::timestamptz, $3::uuid))
ORDER BY s.created_at DESC, s.id DESC LIMIT 51`,
  ownerDetail: `SELECT s.id::text AS id, s.identity_id::text AS identity_id,
  s.merchant_id::text AS merchant_id, m.canonical_name AS merchant_name,
  s.custom_name, s.category_code, s.cadence::text AS cadence,
  s.status::text AS status, s.expected_amount_minor::text AS expected_amount_minor,
  s.currency, s.next_charge_date::text AS next_charge_date, s.always_private,
  pg_catalog.to_char(s.created_at AT TIME ZONE $3::text, $4::text) AS created_at
FROM public.subscription AS s LEFT JOIN public.merchant AS m ON m.id = s.merchant_id
WHERE s.identity_id = $1::uuid AND s.id = $2::uuid`,
  ownerStatusLock: `SELECT id::text AS id, identity_id::text AS identity_id, status::text AS status
FROM public.subscription WHERE identity_id = $1::uuid AND id = $2::uuid FOR UPDATE`,
  ownerStatusCompareUpdate: `UPDATE public.subscription SET status = $4::public.subscription_status,
updated_at = pg_catalog.clock_timestamp()
WHERE identity_id = $1::uuid AND id = $2::uuid AND status = $3::public.subscription_status
RETURNING id::text AS id, status::text AS status`,
});
