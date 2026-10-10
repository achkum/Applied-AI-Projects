# ST-081c independent security source review — final snapshot

REVIEW/v1
Task: ST-081c
Role: security-privacy
Attempt: 1 (original start 2026-10-10 17:39:10 UTC)
Base HEAD: 97ed2ac85495866524d97b62bb4050085cdf27c4
Disposition: SOURCE CONDITIONS MET; actual PostgreSQL acceptance and merge remain conditional.

This is an exact working-tree source review, not a claim that I ran tests, PostgreSQL, or the production image. The private operation takes a trusted, independently authenticated current principal from `RequestContext`; this repository neither authenticates a token nor exposes an HTTP mutation. It validates UUIDs and the four admitted actions, sets both identical transaction-local identity GUCs through the accepted helper, locks by UUID and principal, verifies the locked owner, applies the accepted decision helper to the locked status, and conditionally updates by owner and old status. Only the seven ACTIVE/PAUSED/CANCELLED ordinary transitions can succeed. Its return is bounded to ID/status; missing and invisible rows share `SUBSCRIPTION_NOT_FOUND`, and unexpected driver errors are masked as `SUBSCRIPTION_STORAGE_ERROR`. No audit, replay payload, schema, public route, or broader lifecycle action was added.

The fixture's ordinary LOGIN role is non-superuser and non-BYPASSRLS, inherits only the runtime role, and verifies RLS plus UPDATE privilege. It now proves peer SELECT readability of shared and open-book rows before asserting that the same peer cannot write them; it also checks always-private and unrelated denial, all seven owner transitions, competing writes, stale conflict, rollback, and pooled dual-GUC cleanup. These are source assertions until the disposable PG16 workflow passes.

The runner ignores ambient `DATABASE_URL`, creates only a labelled, local-port, tmpfs PG16 container, records and validates its exact CID before removal, bounds temp-directory cleanup, and emits a receipt without credentials or fixture IDs. It builds the narrow domain export before Vitest. API scripts and Docker include the domain dependency and compiled artifact; image smoke imports the helper and writer from the production image. No source-level privacy or ownership veto remains at this snapshot.

Before merge: green exact-head frozen install and applicable API checks, owned PG16 proof with PASS receipt and verified cleanup, independent QA acceptance of actual PG behavior, and actual Node 22.18 image build/start/import smoke. Re-review if relevant blobs change. This source disposition does not approve production release, public mutation, or completion of ST-081/UF-06.

Exact working-tree Git blob IDs (raw bytes; not committed-head identities):

| File | Blob |
| --- | --- |
| `apps/api/src/subscriptions/subscription-lifecycle.repository.ts` | `c1837f7a3623c58b11ad149856d59c08d7b32f53` |
| `apps/api/src/subscriptions/subscription-lifecycle.repository.spec.ts` | `e69afda72a76e556960db4fbc1153100a41af965` |
| `apps/api/test/subscription-lifecycle-storage.integration.ts` | `3354bac14bb2b641983408e74e4d4274bfe26547` |
| `tools/database/subscription-lifecycle-proof.sh` | `f32e6a100b1854968c8e66fb258f7973ebe12502` |
| `apps/api/Dockerfile` | `403f71bdfbe1d5264eb01fded4cd99e43d85dfba` |
| `apps/api/package.json` | `080aa5b2193f7009557dbb52d4035f1167a0d4d0` |
| `packages/domain/package.json` | `8d48b605663a4007e133b1bfe19d2e58bc4e86d9` |
| `packages/domain/tsconfig.lifecycle.json` | `f5ee88963ff9ea1cdc1d492043441066bb216377` |
| `pnpm-lock.yaml` | `847b85bac62936f5d2b48b697dfcdf8f498ccd62` |
| `tools/containers/smoke-images.sh` | `ca12c81f73fc80dab28da17a01ab2f6d7398b5aa` |
| `.github/workflows/subtrack-subscription-lifecycle-proof.yml` | `ed3cff744ed3b8ac0fc8e1d3c1a2f9a1c3283f17` |
