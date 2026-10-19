# ST081 storage final proposal handoff / ST249 roster expansion

Evidence-only amendments complete, 2026-10-14. No runtime edit, SQL execution, tests, Git mutation or push. Domain stream remains root-owned and untouched. Exact review texts: `st081-017-ddl-proposal.sql`, `st081-named-sql-contract-proposal.md`; companion freeze and development proposal amendments record superseding inverse/display rules. Independent final platform/privacy assent remains required before root freezes storage source.

Latest platform corrections: candidate INSERT SELECT joins same owned account→exact active/unpurged/synced Synthetic generation and proves subscription currency/paying-account/cadence plus typed trusted source=DETECTED/status=DETECTED and always_private=true. Original receipt stores generated feedback_id with same-owner/same-candidate FK and unique owner/feedback; compensation matches exact f.id, not timestamp. Both operations require exactly1 returned row or full rollback. Receipt's unique owner/original Undo FK prevents second successful inverse. Existing trigger alone increments revision.

Pure-domain bigint can represent abs(int64-min)=9223372036854775808. Persistence must validate every candidate representative before the first candidate/subscription/source-link/scan-receipt write: bigint only, strictly positive and <=9223372036854775807. One invalid result rejects/rolls back the whole scan; no Number/clamp/drop/truncate. Original bank/raw rows stay exact. Known expiry409 requires successful pre-COMMIT rollback; last synchronous business guard reads trusted fresh now against immutable locked original deadline after token verification and all awaited epoch/session writes. Unknown/async guard, regressing clock and rollback/commit uncertainty remain500. Replay carries no newly expiring inverse. Trusted matched catalogue/fixed Synthetic canonical names only, never raw-normalized text. Manual-only observer proves manual equality after legitimate detection inserts.

## Exact proposed additions to ST249 allowed_paths (root must freeze before edits)

App-relative paths below use Git prefix `SubTrack/`; workflow paths use root `.github/`. Existing pure-domain paths stay unchanged; no domain author overlap. New filenames are proposed contract names, not already implemented files. Generated directories are exact existing generator output roots, not license to edit unrelated source.

```text
SubTrack/apps/api/prisma/development-auth/017-private-mobile-detection.sql
SubTrack/apps/api/src/auth/mobile-private/durable-mobile-authority.ts
SubTrack/apps/api/src/auth/mobile-private/durable-mobile-authority.spec.ts
SubTrack/apps/api/src/auth/mobile-private/private-mobile-http.ts
SubTrack/apps/api/src/auth/mobile-private/private-mobile-http.spec.ts
SubTrack/apps/api/src/auth/mobile-private/private-mobile-server.ts
SubTrack/apps/api/src/auth/mobile-private/private-mobile-server.spec.ts
SubTrack/apps/api/src/detection/private-mobile-detection.ts
SubTrack/apps/api/src/detection/private-mobile-detection.spec.ts
SubTrack/apps/api/src/detection/private-mobile-detection-statements.ts
SubTrack/apps/api/src/detection/private-mobile-detection-body.ts
SubTrack/apps/api/src/detection/private-mobile-detection-body.spec.ts
SubTrack/apps/api/package.json
SubTrack/packages/contracts/private-mobile-detection.ts
SubTrack/packages/contracts/tests/private-mobile-detection.test.mjs
SubTrack/packages/contracts/tests/contracts.test.mjs
SubTrack/packages/contracts/tests/private-mobile.test.mjs
SubTrack/packages/contracts/openapi.yaml
SubTrack/packages/contracts/package.json
SubTrack/packages/contracts/generated/**
SubTrack/packages/contracts/fixtures/generated/**
SubTrack/apps/mobile/src/api/privateMobileDetection.ts
SubTrack/apps/mobile/src/api/privateMobileDetection.test.ts
SubTrack/apps/mobile/src/components/detection/NativeDetectionInboxScreen.tsx
SubTrack/apps/mobile/src/components/detection/NativeDetectionInboxScreen.test.tsx
SubTrack/apps/mobile/app/personal-detections.tsx
SubTrack/apps/mobile/src/components/onboarding/NativePersonalScreen.tsx
SubTrack/apps/mobile/src/components/onboarding/NativePersonalScreen.test.tsx
SubTrack/apps/mobile/src/components/billing/NativeBillingMonthScreen.tsx
SubTrack/apps/mobile/src/components/billing/NativeBillingMonthScreen.test.tsx
SubTrack/apps/api/test/private-mobile-owned-fixture.ts
SubTrack/apps/api/test/private-mobile-owned-fixture-observer.ts
SubTrack/apps/api/test/private-mobile-owned-fixture-observer.spec.ts
SubTrack/apps/api/test/private-mobile-detection-proof.ts
SubTrack/apps/api/test/private-mobile-detection-fixture.spec.ts
SubTrack/apps/api/test/private-mobile-detection.integration.ts
SubTrack/apps/api/test/private-mobile-detection-receipt.ts
SubTrack/apps/api/test/private-mobile-detection-receipt.spec.ts
SubTrack/tools/database/private-mobile-proof.sh
SubTrack/tools/database/private-mobile-detection-qualify.sh
SubTrack/tools/database/private-mobile-descriptor.spec.sh
.github/workflows/subtrack-private-mobile-proof.yml
SubTrack/apps/mobile/scripts/private-runtime-detection.mjs
SubTrack/apps/mobile/scripts/private-runtime-detection-test.mjs
SubTrack/apps/mobile/scripts/private-runtime-device.mjs
SubTrack/apps/mobile/scripts/private-runtime-flow-env.mjs
SubTrack/apps/mobile/scripts/private-runtime-flow-policy.mjs
SubTrack/apps/mobile/scripts/private-runtime-flow-policy-test.mjs
SubTrack/apps/mobile/e2e/private-runtime-detection-scan.yaml
SubTrack/apps/mobile/e2e/private-runtime-detection-confirm.yaml
SubTrack/apps/mobile/e2e/private-runtime-detection-reject.yaml
SubTrack/apps/mobile/e2e/private-runtime-detection-undo.yaml
SubTrack/apps/mobile/e2e/private-runtime-detection-restart.yaml
.github/workflows/subtrack-native-device-proof.yml
```

Loader must enable017 only in owned local/test fixture. Detection qualifier runs original parent then bank baseline before detection proof; manual-only observer is additional to unchanged baseline. Hosted workflow selects changed qualifier only after exact source review, never earlier. Native installed journey/source scripts receive separate client/platform/privacy source review before changed dispatch; no acceptance flags or substituted fixtures. Native copies/localization filenames must be named by the native author and frozen by root before edits if existing mounted flow requires additional files. No broader runtime grants, bank purge exception, production migrations, catalogue writes, default enablement, training/export/erasure policy or new microtickets are requested.
