/** Fixed quote-free statements installed only in the private loopback composition. */
export const PRIVATE_MANUAL_CREATE_STATEMENTS = Object.freeze({
  manualModeRead: `SELECT profile_complete, onboarding_mode FROM public.identity_profile WHERE identity_id=$1::uuid`,
  manualReceiptRead: `SELECT request_hash, subscription_id::text AS subscription_id
FROM public.manual_subscription_create_receipt WHERE identity_id=$1::uuid AND key_hash=$2::bytea`,
  manualSubscriptionInsert: `INSERT INTO public.subscription
(identity_id,custom_name,category_code,cadence,expected_amount_minor,next_charge_date,source,status,currency,always_private,updated_at)
VALUES ($1::uuid,$2::varchar(120),$3::text,$4::public.subscription_cadence,$5::bigint,$6::date,$7::public.subscription_source,$8::public.subscription_status,$9::char(3),$10::boolean,pg_catalog.clock_timestamp())
RETURNING id::text AS id`,
  manualReceiptInsert: `INSERT INTO public.manual_subscription_create_receipt
(identity_id,key_hash,request_hash,subscription_id) VALUES ($1::uuid,$2::bytea,$3::bytea,$4::uuid)
RETURNING subscription_id::text AS subscription_id`,
});
