/** Fixed quote-free statements installed only in the private loopback composition. */
export const PRIVATE_MANUAL_CREATE_STATEMENTS = Object.freeze({
  manualModeRead: `SELECT profile_complete, onboarding_mode FROM public.identity_profile WHERE identity_id=$1::uuid`,
  manualReceiptRead: `SELECT request_hash, subscription_id::text AS subscription_id
FROM public.manual_subscription_create_receipt WHERE identity_id=$1::uuid AND key_hash=$2::bytea`,
  manualIdMint: `SELECT pg_catalog.gen_random_uuid()::text AS id`,
  manualSubscriptionInsert: `INSERT INTO public.subscription
(id,identity_id,custom_name,category_code,cadence,expected_amount_minor,next_charge_date,source,status,currency,always_private,updated_at)
VALUES ($1::uuid,$2::uuid,$3::varchar(120),$4::text,$5::public.subscription_cadence,$6::bigint,$7::date,$8::public.subscription_source,$9::public.subscription_status,$10::char(3),$11::boolean,pg_catalog.clock_timestamp())`,
  manualReceiptInsert: `INSERT INTO public.manual_subscription_create_receipt
(identity_id,key_hash,request_hash,subscription_id) VALUES ($1::uuid,$2::bytea,$3::bytea,$4::uuid)
RETURNING subscription_id::text AS subscription_id`,
});
