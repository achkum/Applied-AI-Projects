# ST081 exact named SQL and transaction amendment proposal

Evidence only, 2026-10-14. Companion `st081-017-ddl-proposal.sql` is proposed text, not installed 017, and has not been executed. Independent platform/privacy SQL contract review precedes root's coherent source task. Existing ordinary role, owner/session graph, bank tables/grants/purge SQL, shared bigint algorithm and revision trigger are reused. No runtime file changed.

## Required final precommit and receipt amendment

Current `DurablePrivateMobileAuthority.withCurrentMobileAuthority` closes action then awaits current-session check; its outer transaction awaits epoch write before a token-only beforeCommit callback. Therefore an action-local `detectionFinalFence` is insufficient for the required Undo deadline. Proposed narrow additive third argument is a synchronous optional precommit guard, owned only by the trusted detection composition. Existing token verification runs first in the same callback; then the guard synchronously reads fresh trusted `authority.now()` and requires strictly less than the immutable original deadline snapshot locked earlier. No await, clock read caching, request-provided time, new role, token shortcut or detached work. Equality or advancement after any awaited write/fence requests known expiry rollback; nonmonotonic/invalid clock remains unavailable. Original Confirm/Reject/Scan and successful immutable replay do not install an old Undo deadline guard. Native readback remains required for unknown commit. Exact authority/spec paths need root roster before edits.

Closed business-guard result proposal: synchronous `undefined` means pass; exact `UNDO_EXPIRED` means create an internal authority-owned tagged expiry (private WeakSet provenance, never a caller error/message match). Any other return, Promise/thenable, callback exception or clock regression is generic unavailable500. Existing token verification still precedes this guard. Transaction catch can propagate this one known expiry as409 only when BEGIN succeeded, COMMIT was never attempted and awaited ROLLBACK returned command ROLLBACK successfully. Failed/unknown rollback, attempted/uncertain commit, async/unknown guard and ordinary storage errors remain masked500. Do not reclassify existing denied/unavailable paths or accept a client-supplied callback. The trusted final closure is installed only for a new successful Undo path, evaluates current clock after all prior awaits, and returns the enum on strict equality/advance; replay has no new inverse or old deadline. Contract type/checks disallow an async guard; focused tests must also prove a runtime thenable cannot upgrade expiry or commit. This is a proposed narrow known-rollback extension, not permission to propagate arbitrary work exceptions.

DDL supplies same-owner/same-candidate feedback.superseded_by_event_id FK to the compensating receipt, same-owner/same-candidate Undo-to-original FK and unique `(identity_id,undo_of_receipt_id)` successful Undo relationship. Each original review receipt stores its generated feedback_id with a same-owner/same-candidate FK to that exact binary feedback event and unique owner/feedback relationship; Undo receipts have feedback_id=NULL. Supersede SQL joins that exact feedback ID, operation=undo and matching original consumed receipt; timestamp equality never substitutes for event identity. Both consumption and superseding update return exactly one row or rollback. Existing subscription revision BEFORE UPDATE trigger owns increment; compare SQL never assigns revision. Candidate and source-link identity has SELECT/INSERT only. Candidate lock takes FOR UPDATE on existing subscription, under the already-held owner identity lock; no candidate UPDATE grant is needed.

All literals below are exact proposed quote-free parameterized statements. Every values array begins with the trusted current identity `$1`; the authority must reject a different first parameter for this exact roster, not let callers provide owner. Existing both-GUC FORCE RLS function and current authority are mandatory. Server constants in the parameter table are installed values, not client-selected knobs; no caller SQL/name access. Registry unchanged generic quote/comment/DELETE prohibition can admit these statements without an exception. Strict domain/wire validates UUID/int64/hash/closed enums, same-owner tuple, canonical Money/string roundtrip and bounded response before execution.

```ts
const PRIVATE_MOBILE_DETECTION_STATEMENTS = Object.freeze({
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
```

## Exact trusted parameter contract

| Name | Values after trusted owner `$1` |
| --- | --- |
| detectionModeRead | none; require complete profile and Just me before any replay |
| detectionActiveGenerationLock | SYNTHETIC, synthetic-demo-v1, solberg-v1, ACTIVE; require exactly1 row |
| detectionBookedRows | locked connection UUID, SYNTHETIC, synthetic-demo-v1, solberg-v1, ACTIVE, BOOKED; 10001 means over bound and rollback, never truncation |
| detectionScanReceiptRead | scoped SHA256 key hash; current active generation checked first |
| detectionScanReceiptInsert | locked generation, key hash, empty-body request SHA256, trusted canonical completion UTC, complete |
| detectionCandidateLookup | locked generation, deterministic candidate SHA256; compare every closed identity tuple field on hit; unequal tuple conflicts |
| detectionSubscriptionInsert | generated UUID, unambiguous trusted catalogue merchant UUID or null for fixed server Synthetic roster, grouped account UUID, that trusted record's canonicalName or null when catalogue name is joined, trusted category, shared detector cadence, bigint canonical amount string, account currency, DETECTED, DETECTED, bounded confidence decimal, allowlisted reason-code array JSON, trusted completion UTC |
| detectionCandidateInsert | created subscription UUID, locked generation UUID, grouped account UUID, accepted merchant key, currency, shared cadence, recurring-bigint-v1, candidate SHA256, SYNTHETIC, synthetic-demo-v1, solberg-v1, ACTIVE, DETECTED source, DETECTED status; account→connection→generation and subscription/account currency/paying-account agreement, initial detection source/status/always-private checked in INSERT SELECT; require exactly1 RETURNING row |
| detectionSourceLinkInsert | created subscription UUID, exactly one selected booked transaction UUID, BOOKED, SYNTHETIC, synthetic-demo-v1, solberg-v1, ACTIVE; require exactly1 row each |
| detectionInboxPage | DETECTED source, DETECTED status, decoded canonical opaque cursor timestamp or null, decoded cursor UUID or null, trusted UTC, existing YYYY-MM-DD doublequoted T HH24:MI:SS.US doublequoted Z format; 51st row only creates nextCursor. Exact microsecond projection preserves ordering without PG Date truncation; current cursor is canonical endpoint-bound base64, not signed. Root-approved projection amendment2026-10-14, no authority/grant change |
| detectionReceiptLock | candidate UUID/null, original receipt UUID/null, fixed operation/null, scoped key hash/null; original-id branch for Undo then key branch with its proven candidate; each requires0 or1 row |
| detectionCandidateLock | proven candidate UUID; require one immutable candidate link and subscription source DETECTED/always-private |
| detectionCompareUpdate | proven candidate UUID, locked expected revision int64 string, locked prior status, fixed resulting status, trusted UTC completion, DETECTED source; require exactly1 row and returned revision=prior+1 |
| detectionFeedbackInsert | generated feedback UUID, candidate UUID, fixed binary label, exact original receipt completion |
| detectionFeedbackSupersede | candidate UUID, newly inserted Undo receipt UUID, locked original receipt UUID, undo, original confirm/reject, matching binary label; require exactly1 row |
| detectionReceiptInsert | generated receipt UUID, candidate UUID, fixed operation, scoped key SHA256, canonical request SHA256, pre/post int64 strings, prior/result status, trusted completion, original deadline/null, original receipt UUID/null, exact strict ReviewResult JSON, exact generated original feedback UUID/null for Undo |
| detectionReceiptConsume | locked original UUID, candidate UUID, trusted Undo completion UTC strictly before deadline, locked original confirm/reject; require exactly1 row |
| detectionFinalFence | current verified session UUID, freshly read trusted clock millis integer, existing persisted Just me literal; require exactly1 row; this is additional fence, not substitute for final synchronous deadline guard |

Source identity digest uses versioned length-prefixed UTF8 fields, not delimiter concatenation: owner UUID, generation UUID, account UUID, unambiguous trusted matched merchant key, currency, cadence, recurring-bigint-v1. Candidate identity/tuple/source links are immutable on rescan; existing match is compared, then skipped even if reviewed. No rescan update overwrites amount/reasons/review state or expands original source links in this first slice. Scan completion receipt readback occurs in same transaction after insert, and external response follows committed authority return.

Positive persistence boundary: PostgreSQL raw amount may equal signed int64 minimum `-9223372036854775808`; its exact bigint absolute debit is `9223372036854775808`, exceeding candidate/subscription BIGINT maximum. Before any candidate/subscription/source-link/scan-receipt write, validate every selected detector candidate representative amount using bigint only: `0n < amount && amount <= 9223372036854775807n`. Validate all resulting candidates before starting the first write so one unpersistable candidate rolls back the whole scan without partial inserts. Reject/rollback with the existing unavailable/conflict boundary, never Number conversion, clamping, truncation, wraparound, silently dropped candidate or substituted amount. Shared pure-domain detection may return mathematically exact bigger positive values; only this persistence boundary narrows the result. Tests must exercise signed-int64 minimum raw debit and a positive representable boundary without mutating manual/bank digests.

Review order: existing current authority holds owner identity/session; mode; scoped-key receipt read/lock; candidate subscription lock; validate lifecycle and exact revision; subscription compare update; feedback insert; immutable receipt insert; named final fence; authority current-session and epoch await; unchanged token verification before commit. Undo: original receipt lock → own undo-key lookup/replay → same candidate lock → deadline and original post-revision validation → compare update → consume original → insert compensating receipt → supersede exact original feedback → named final fence → authority awaits → token check plus synchronous strict deadline guard → COMMIT. Same-key replay returns stored immutable result after fresh authority/mode/resource proof without requiring current status still equal old snapshot and without a second write. Distinct concurrent keys serialize on existing owner identity lock; unique constraints backstop duplicates.

## Source-bound amendments requiring reviewer assent

The accepted bank Synthetic importer can leave raw_transaction.merchant_id null. No runtime catalogue write grant is proposed. Use existing matchMerchantDescriptor against the trusted catalogue records or fixed server-owned Synthetic canonical roster passed as accepted matching candidates; require one unambiguous match. The accepted matcher already returns null unless there is exactly one distinct matching key; use this existing ambiguity rule, no cloned normalizer or guessed tie break. Additional singleton-roster uniqueness proof may assert the same invariant but must not replace or weaken the accepted matcher. Display/merchant_key/category are that trusted record's canonicalName/key/category. For a fixed Synthetic roster record without database merchant UUID, subscription.custom_name stores only that fixed trusted canonicalName. Inbox reads catalogue canonical_name when present, otherwise this fixed canonicalName. Normalizing a raw descriptor does not remove PII: never persist normalizer(raw) output as display/key/custom_name, and never fall back to raw text. Unresolved/ambiguous matching fails the group closed. Raw descriptor stays transaction-local RAM input to the accepted matcher; no cloned normalization algorithm. This frozen refinement supplies usable Synthetic names without catalogue grants or private text persistence.

Proposed proof must validate DDL checks against NULL bypass, original deadline millisecond agreement, one compensating feedback per Undo, immutable-source grants, both-GUC negatives and reciprocal foreign candidate/receipt denial, FK purge rollback, exact actor/target/manual/bank/receipt digests, collision/rescan, race/replay after expiry, trusted clock advancement during each awaited mutation/session/epoch fence including equality, full rollback and bigint >safe-number parity. Include trusted catalogue/Synthetic roster matching, ambiguous/unresolved refusal and private canaries proving raw-normalized text never persists. Prove409 expiry only after known successful rollback; rollback/commit uncertainty, unknown/async guard and clock regression remain500. These are future reviewed checks; no such runtime result claimed here. No production retention/export/training or owner erasure policy is inferred.

For manual equality after detection creates subscription rows, add a fixture-observer digest restricted to source=MANUAL; the existing all-subscription digest cannot truthfully prove manual preservation once legitimate DETECTED rows are inserted. Keep parent baseline proof first and unchanged. Use the already-owned observer role and private digest-only comparison, never export raw manual rows or weaken existing parent/bank equality gates. Include cross-generation/cross-owner account candidate-insert negatives and two events sharing timestamps so only the receipt's exact feedback_id can be superseded.
