/** Fixed owner-qualified statements installed only in the private loopback composition. */
export const PRIVATE_MANUAL_EDIT_STATEMENTS = Object.freeze({
  manualEditModeRead: `SELECT profile_complete, onboarding_mode FROM public.identity_profile WHERE identity_id=$1::uuid`,
  manualEditReceiptRead: `SELECT request_hash, subscription_id::text AS subscription_id, result_revision::text AS result_revision
FROM public.manual_subscription_edit_receipt WHERE identity_id=$1::uuid AND key_hash=$2::bytea`,
  manualEditTargetLock: `SELECT id::text AS id, revision::text AS revision
FROM public.subscription WHERE identity_id=$1::uuid AND id=$2::uuid
AND source=$3::public.subscription_source AND currency=$4::char(3)
AND cadence IN('WEEKLY','MONTHLY','QUARTERLY','SEMIANNUAL','ANNUAL') FOR UPDATE`,
  manualEditCompareUpdate: `UPDATE public.subscription
SET custom_name=$4::varchar(120), category_code=$5::text, cadence=$6::public.subscription_cadence,
expected_amount_minor=$7::bigint, next_charge_date=$8::date, updated_at=pg_catalog.clock_timestamp()
WHERE identity_id=$1::uuid AND id=$2::uuid AND revision=$3::bigint
AND source=$9::public.subscription_source AND currency=$10::char(3)
AND cadence IN('WEEKLY','MONTHLY','QUARTERLY','SEMIANNUAL','ANNUAL')
RETURNING id::text AS id, revision::text AS revision`,
  manualEditReceiptInsert: `INSERT INTO public.manual_subscription_edit_receipt
(identity_id,key_hash,request_hash,subscription_id,result_revision)
VALUES ($1::uuid,$2::bytea,$3::bytea,$4::uuid,$5::bigint)
RETURNING subscription_id::text AS subscription_id, result_revision::text AS result_revision`,
});
