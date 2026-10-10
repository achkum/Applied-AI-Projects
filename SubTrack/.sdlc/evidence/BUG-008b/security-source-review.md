# BUG-008b independent security/privacy source review

```yaml
contract: REVIEW/v1
task_id: BUG-008b
reviewer: security-privacy
stage: final-source, draft PR 237
base: f372fa5
head: f4f6acb473fd60cb0063968299e58cd04f1037ae
verdict: REQUEST_CHANGES
findings:
  - severity: major
    file: apps/api/prisma/migrations/0002_privacy_constraints/migration.sql:279
    issue: "Any active household admin can INSERT any identity as MEMBER or ADMIN without invitation acceptance. The new member immediately qualifies for household visibility, bypassing UF-03's invitee decision."
    fix: "Limit ordinary INSERT to the first-admin empty-household bootstrap; require the invitation service's accepted, unexpired invitation for later MEMBER inserts. Add an ordinary-LOGIN denial and service-LOGIN success regression."
  - severity: major
    file: apps/api/prisma/migrations/0002_privacy_constraints/migration.sql:122
    issue: "The service transition exempts invitee_id from immutable fields. It can accept an invitation already bound to identity B as identity C, then insert C as a member using the accepted invitation."
    fix: "Permit NULL-to-verified-identity binding only; preserve a non-NULL invitee_id across ACCEPTED/DECLINED/EXPIRED transitions and test retarget denial under the service LOGIN."
```

Source positives: runtime policies are now `TO subtrack_runtime`; identity bootstrap, OTP, invitation and catalogue use separate NOLOGIN grant roles; the lookup role owns Boolean functions only, has column-level SELECT, fixed `pg_catalog` search paths, qualified relations and no runtime membership. Runtime lacks protected table ownership, schema CREATE, generic lookup EXECUTE, and OTP/catalogue writes by the reviewed grants. Owner-only banking/transaction/charge and session/consent policies, owner/authority immutability, share revocation after departure, charge source locking, and audit INSERT-only grants are present. The test constructs real ordinary LOGIN connections and checks dual-GUC missing/invalid/mismatched context, rollback/reuse, RLS decisions, and concurrent charge/admin guards. These are source observations, not executed PostgreSQL results.

SHA-256 normalized LF: baseline SQL `462391fec9ad2846508b35ad1a172ec46e9eacb652faffb66d33d46d773a9fad`; privacy SQL `0a99c5cc760315f887a89e0e8dc792857d98b6e3bd04a687dc7a9321e7864ace`; proof test `b20ecf7af25782a9044618a9f9efe24f5ea6a35a84bddb6079659c48df957d09`. Working-tree copies have CRLF; hashes above normalize CRLF to LF. I ran no tests or database operations. Actual owned PG16 CI, QA, platform review and exact revised-head security review remain required; no DONE or runtime authorization claim.
