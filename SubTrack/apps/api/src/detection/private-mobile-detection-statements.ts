export const PRIVATE_MOBILE_DETECTION_STATEMENTS = Object.freeze({
 detectionModeRead: `SELECT onboarding_mode,profile_complete FROM public.identity_profile
WHERE identity_id=$1::uuid AND public.subtrack_principal_matches($1::uuid)`,
 detectionActiveGenerationLock: `SELECT bc.id::text AS connection_id,bg.fixture_version
FROM public.bank_connection bc JOIN st248_bank.generation bg ON bg.connection_id=bc.id AND bg.identity_id=bc.identity_id
WHERE bc.identity_id=$1::uuid AND bg.identity_id=$1::uuid AND bc.provider=$2::public.bank_provider
AND bc.institution_id=$3::text AND bg.fixture_version=$4::text AND bc.status=$5::public.bank_connection_status
AND bc.revoked_at IS NULL AND bg.purged_at IS NULL AND bc.last_synced_at IS NOT NULL
ORDER BY bc.id LIMIT 2 FOR UPDATE OF bc,bg`,
 detectionBookedRows: `SELECT rt.id::text AS transaction_id,ba.id::text AS account_id,
rt.transaction_date::text AS transaction_date,rt.amount_minor::text AS amount_minor,
rt.currency,rt.raw_description,rt.merchant_id::text AS merchant_id,
m.canonical_name,m.slug AS canonical_merchant_key,m.category_code
FROM public.raw_transaction rt JOIN public.bank_account ba ON ba.id=rt.account_id AND ba.identity_id=rt.identity_id
JOIN public.bank_connection bc ON bc.id=ba.connection_id AND bc.identity_id=ba.identity_id
JOIN st248_bank.generation bg ON bg.connection_id=bc.id AND bg.identity_id=bc.identity_id
LEFT JOIN public.merchant m ON m.id=rt.merchant_id
WHERE rt.identity_id=$1::uuid AND ba.identity_id=$1::uuid AND bc.identity_id=$1::uuid AND bg.identity_id=$1::uuid
AND bc.id=$2::uuid AND bc.provider=$3::public.bank_provider AND bc.institution_id=$4::text
AND bg.fixture_version=$5::text AND bc.status=$6::public.bank_connection_status AND bc.revoked_at IS NULL
AND bg.purged_at IS NULL AND bc.last_synced_at IS NOT NULL AND rt.status=$7::public.transaction_status
AND rt.amount_minor<0 AND rt.is_refund=false AND rt.currency=ba.currency
ORDER BY ba.id,rt.transaction_date,rt.id LIMIT 10001`,
 detectionScanReceiptRead: `SELECT connection_id::text AS connection_id,request_h,result_status
FROM st081_detection.scan_receipt WHERE identity_id=$1::uuid AND key_h=$2::bytea`,
 detectionScanReceiptInsert: `INSERT INTO st081_detection.scan_receipt(identity_id,connection_id,key_h,request_h,completed_at,result_status)
VALUES($1::uuid,$2::uuid,$3::bytea,$4::bytea,$5::timestamptz,$6::text) RETURNING connection_id::text AS connection_id`,
 detectionCandidateLookup: `SELECT c.subscription_id::text AS subscription_id,c.connection_id::text AS connection_id,
c.account_id::text AS account_id,c.merchant_key,c.currency,c.cadence::text AS cadence,c.algorithm_version,c.candidate_h,
s.status::text AS status,s.revision::text AS revision
FROM st081_detection.candidate c JOIN public.subscription s ON s.id=c.subscription_id AND s.identity_id=c.identity_id
WHERE c.identity_id=$1::uuid AND s.identity_id=$1::uuid AND c.connection_id=$2::uuid AND c.candidate_h=$3::bytea`,
 detectionSubscriptionInsert: `INSERT INTO public.subscription(id,identity_id,merchant_id,paying_account_id,custom_name,category_code,
cadence,expected_amount_minor,currency,status,source,confidence,detection_reasons,next_charge_date,always_private,updated_at)
VALUES($2::uuid,$1::uuid,$3::uuid,$4::uuid,$5::varchar(120),$6::varchar(50),$7::public.subscription_cadence,
$8::bigint,$9::char(3),$10::public.subscription_status,$11::public.subscription_source,$12::numeric(5,4),$13::jsonb,NULL,true,$14::timestamptz)
RETURNING id::text AS id,revision::text AS revision`,
 detectionCandidateInsert: `INSERT INTO st081_detection.candidate(identity_id,subscription_id,connection_id,account_id,merchant_key,currency,cadence,algorithm_version,candidate_h)
SELECT $1::uuid,$2::uuid,bc.id,ba.id,$5::varchar(160),ba.currency,$7::public.subscription_cadence,$8::text,$9::bytea
FROM public.bank_account ba JOIN public.bank_connection bc ON bc.id=ba.connection_id AND bc.identity_id=ba.identity_id
JOIN st248_bank.generation bg ON bg.connection_id=bc.id AND bg.identity_id=bc.identity_id
JOIN public.subscription s ON s.id=$2::uuid AND s.identity_id=ba.identity_id
WHERE ba.identity_id=$1::uuid AND bc.identity_id=$1::uuid AND bg.identity_id=$1::uuid AND s.identity_id=$1::uuid
AND ba.id=$4::uuid AND bc.id=$3::uuid AND ba.currency=$6::char(3) AND s.currency=ba.currency AND s.paying_account_id=ba.id
AND s.cadence=$7::public.subscription_cadence AND bc.provider=$10::public.bank_provider AND bc.institution_id=$11::text
AND bg.fixture_version=$12::text AND bc.status=$13::public.bank_connection_status AND bc.revoked_at IS NULL
AND bg.purged_at IS NULL AND bc.last_synced_at IS NOT NULL
AND s.source=$14::public.subscription_source AND s.status=$15::public.subscription_status AND s.always_private=true
RETURNING subscription_id::text AS subscription_id`,
 detectionSourceLinkInsert: `INSERT INTO st081_detection.source_link(identity_id,subscription_id,raw_transaction_id)
SELECT $1::uuid,c.subscription_id,rt.id FROM st081_detection.candidate c
JOIN public.raw_transaction rt ON rt.identity_id=c.identity_id AND rt.account_id=c.account_id
JOIN public.bank_account ba ON ba.id=rt.account_id AND ba.identity_id=rt.identity_id AND ba.connection_id=c.connection_id
JOIN public.bank_connection bc ON bc.id=ba.connection_id AND bc.identity_id=ba.identity_id
JOIN st248_bank.generation bg ON bg.connection_id=bc.id AND bg.identity_id=bc.identity_id
WHERE c.identity_id=$1::uuid AND rt.identity_id=$1::uuid AND ba.identity_id=$1::uuid AND bc.identity_id=$1::uuid AND bg.identity_id=$1::uuid
AND c.subscription_id=$2::uuid AND rt.id=$3::uuid AND rt.currency=c.currency AND rt.currency=ba.currency
AND rt.status=$4::public.transaction_status AND rt.amount_minor<0 AND rt.is_refund=false
AND bc.provider=$5::public.bank_provider AND bc.institution_id=$6::text AND bg.fixture_version=$7::text
AND bc.status=$8::public.bank_connection_status AND bc.revoked_at IS NULL AND bg.purged_at IS NULL AND bc.last_synced_at IS NOT NULL
RETURNING raw_transaction_id::text AS raw_transaction_id`,
 detectionInboxPage: `SELECT s.id::text AS id,s.revision::text AS revision,
COALESCE(m.canonical_name,s.custom_name) AS display_name,s.category_code,s.cadence::text AS cadence,
s.expected_amount_minor::text AS expected_amount_minor,s.currency,s.confidence::text AS confidence,
s.detection_reasons,s.status::text AS status,pg_catalog.to_char(s.created_at AT TIME ZONE $6::text,$7::text) AS created_at
FROM st081_detection.candidate c JOIN public.subscription s ON s.id=c.subscription_id AND s.identity_id=c.identity_id
LEFT JOIN public.merchant m ON m.id=s.merchant_id
WHERE c.identity_id=$1::uuid AND s.identity_id=$1::uuid AND s.source=$2::public.subscription_source
AND s.status=$3::public.subscription_status AND s.always_private=true
AND ($4::timestamptz IS NULL OR (s.created_at,s.id)<($4::timestamptz,$5::uuid))
ORDER BY s.created_at DESC,s.id DESC LIMIT 51`,
 detectionReceiptLock: `SELECT id::text AS id,subscription_id::text AS subscription_id,operation,key_h,request_h,
pre_revision::text AS pre_revision,post_revision::text AS post_revision,prior_status::text AS prior_status,
result_status::text AS result_status,completed_at,undo_until,consumed_at,undo_of_receipt_id::text AS undo_of_receipt_id,feedback_id::text AS feedback_id,result_response
FROM st081_detection.review_receipt WHERE identity_id=$1::uuid
AND (($3::uuid IS NULL AND subscription_id=$2::uuid AND operation=$4::text AND key_h=$5::bytea)
OR ($3::uuid IS NOT NULL AND id=$3::uuid)) FOR UPDATE`,
 detectionCandidateLock: `SELECT c.subscription_id::text AS id,s.source::text AS source,s.status::text AS status,
s.revision::text AS revision,s.always_private
FROM st081_detection.candidate c JOIN public.subscription s ON s.id=c.subscription_id AND s.identity_id=c.identity_id
WHERE c.identity_id=$1::uuid AND s.identity_id=$1::uuid AND c.subscription_id=$2::uuid FOR UPDATE OF s`,
 detectionCompareUpdate: `UPDATE public.subscription s SET status=$5::public.subscription_status,updated_at=$6::timestamptz
FROM st081_detection.candidate c WHERE s.identity_id=$1::uuid AND c.identity_id=$1::uuid
AND s.id=$2::uuid AND c.subscription_id=s.id AND s.revision=$3::bigint AND s.status=$4::public.subscription_status
AND s.source=$7::public.subscription_source AND s.always_private=true
RETURNING s.id::text AS id,s.status::text AS status,s.revision::text AS revision`,
 detectionFeedbackInsert: `INSERT INTO st081_detection.feedback(id,identity_id,subscription_id,label,created_at)
VALUES($2::uuid,$1::uuid,$3::uuid,$4::text,$5::timestamptz) RETURNING id::text AS id`,
 detectionFeedbackSupersede: `UPDATE st081_detection.feedback f SET superseded_by_event_id=u.id
FROM st081_detection.review_receipt u JOIN st081_detection.review_receipt r
ON r.identity_id=u.identity_id AND r.id=u.undo_of_receipt_id AND r.subscription_id=u.subscription_id
WHERE f.identity_id=$1::uuid AND u.identity_id=$1::uuid AND r.identity_id=$1::uuid
AND f.subscription_id=$2::uuid AND u.subscription_id=f.subscription_id AND u.id=$3::uuid
AND r.id=$4::uuid AND u.operation=$5::text AND r.operation=$6::text AND r.consumed_at=u.completed_at
AND f.id=r.feedback_id AND f.label=$7::text AND f.superseded_by_event_id IS NULL
RETURNING f.id::text AS id`,
 detectionReceiptInsert: `INSERT INTO st081_detection.review_receipt(id,identity_id,subscription_id,operation,key_h,request_h,
pre_revision,post_revision,prior_status,result_status,completed_at,undo_until,undo_of_receipt_id,result_response,feedback_id)
VALUES($2::uuid,$1::uuid,$3::uuid,$4::text,$5::bytea,$6::bytea,$7::bigint,$8::bigint,
$9::public.subscription_status,$10::public.subscription_status,$11::timestamptz,$12::timestamptz,$13::uuid,$14::jsonb,$15::uuid)
RETURNING id::text AS id,result_response`,
 detectionReceiptConsume: `UPDATE st081_detection.review_receipt SET consumed_at=$4::timestamptz
WHERE identity_id=$1::uuid AND id=$2::uuid AND subscription_id=$3::uuid
AND operation=$5::text AND consumed_at IS NULL AND completed_at<=$4::timestamptz AND undo_until>$4::timestamptz
RETURNING id::text AS id`,
 detectionFinalFence: `SELECT i.id::text AS identity_id FROM public.identity i
JOIN public.identity_profile p ON p.identity_id=i.id
JOIN st244_mobile.session se ON se.identity_id=i.id AND se.id=$2::uuid
WHERE i.id=$1::uuid AND p.identity_id=$1::uuid AND se.identity_id=$1::uuid AND i.deleted_at IS NULL
AND public.subtrack_principal_matches($1::uuid) AND p.profile_complete=true AND p.onboarding_mode=$4::varchar(16)
AND se.revoked_ms IS NULL AND se.created_ms<=$3::bigint AND se.expires_ms>$3::bigint`,
});
