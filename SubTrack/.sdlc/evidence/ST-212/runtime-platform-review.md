# ST-212 runtime platform/source review
contract: REVIEW/v1
task_id: ST-212
reviewer: architect-platform
verdict: REQUEST_CHANGES
source_blobs: repository b9167d29d68150b2842476cdbb598f0a355882a5; service dbc07b22f42e8c1c1822f1696bf6eddfde60c619; controller a50a108e3e0efa19909bf79f7fab827fdde8ce00; OpenAPI 72836cd6c2ff63e1fbb89a112b3feb19763bde30 (quote-only repair from approved draft).
proof_blobs: integration c959096bc76eb8a71bfb59eb7f668b3d080e8a22; config bfd37cf7c26a61105fd2c699f6121b7712689697.
findings:
  - severity: major; file: apps/api/test/subscription-read-storage.integration.ts:84; issue: Raw fixture INSERTs for identity, household, consent and subscription omit updated_at, but canonical migration 0001 declares each updated_at NOT NULL with no default (lines 58, 84, 128, 181). The first identity INSERT fails before HTTP/RLS assertions. Fix: supply synthetic updated_at values in all four INSERT shapes, then run the owned disposable PG16 workflow.
source_assessment: Repository uses accepted dual-GUC transaction helper and non-DETECTED peer narrowing before keyset/limit; inbox is owner+DETECTED. Household SQL requires active caller membership and relies on actual RLS for explicit share/open_book routing; owner rows follow approved Type2 membership interpretation. Service enforces owner/peer allowlists, bigint decimal strings, seven statuses, category allowlist, bounded endpoint/filter-bound cursor and identical missing/invisible 404. Controller uses guard-attached context and is absent from default AppModule.
boundary: This is source/proof-consistency review only; no actual PostgreSQL acceptance, QA, exact-head CI or parent BUG-008b merge claimed.
## Re-review of corrected fixture — APPROVE_SOURCE
contract: REVIEW/v1; task_id: ST-212; reviewer: architect-platform; verdict: APPROVE_SOURCE; findings: []
proof_blobs: integration ffd153206f4e25124b770cd35cabe53d34cd6835; config bfd37cf7c26a61105fd2c699f6121b7712689697. Four INSERTs now set updated_at; all other required nondefault columns in these six fixture tables are supplied. Prior major finding closed.
boundary: Source/fixture consistency only; disposable PG16 execution, QA, exact-head CI and parent acceptance remain unproven.
## Null-prototype query correction — APPROVE_SOURCE
service_blob: 6b59822cc7ee148683c9b696207cf049cf7fec13; service_spec_blob: dbcf2ad3f5694476b37f0a6f85625cfe6d46139b.
finding_closed: Express null-prototype query records now pass the same strict key/value validation; cursor JSON and reason items still require ordinary plain records. The focused spec covers acceptance plus unknown ownerId rejection.
boundary: Source review only; the author's focused tests, independent PG16 proof, QA and exact-head CI remain separate gates.
