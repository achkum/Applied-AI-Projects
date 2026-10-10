# ST-212 runtime security/privacy source review
contract: REVIEW/v1
task_id: ST-212
reviewer: security-privacy
verdict: APPROVE
scope: Current repository/service/controller source and focused specs only; no PostgreSQL or CI proof reviewed.
source_blobs: repository b9167d29d68150b2842476cdbb598f0a355882a5; service dbc07b22f42e8c1c1822f1696bf6eddfde60c619; controller a50a108e3e0efa19909bf79f7fab827fdde8ce00; OpenAPI 72836cd6c2ff63e1fbb89a112b3feb19763bde30.
findings: []
evidence: Repository list/detail narrow RLS with owner-or-non-DETECTED before keyset/limit; inbox requires owner+DETECTED. Household list requires active caller membership; accepted RLS determines peer share/open_book routes. All reads use withRequestTransaction and the controller takes only guard-attached context.
privacy: Peer responses contain only approved summary fields; owner inbox strips raw reason params. No paying-account ID, transaction, raw evidence, total count or hidden-row cursor is projected. Detail absence and invisibility share one 404 shape; cursor input is bounded and endpoint/filter-bound, with no authority claim.
boundary: Controller is absent from default AppModule. Actual ordinary-role PG16 HTTP/RLS proof, independent QA, exact-head CI and accepted parent BUG-008b PR237 remain required before merge; six focused tests do not establish those gates.
