# ST-191 security/privacy source review

**APPROVE** — Scoped source matches the approved internal-only design. Binding hash input is validated before proof consumption; proof context and independent browser chain remain unchanged. The helper accepts only canonical base64url for 32 decoded bytes, hashes under the dedicated domain, and returns no cookie material. Stored binding hashes are web-only and strict lowercase hex; snapshots reject accessors/extra keys, and principal resolution retains credential and owner-scoped live-row checks.

The two lookup ports require exact cookie hash, canonical Origin and bounded current time. Current-session lookup is owner-scoped and active-row-only; refresh lookup derives owner/session solely from active or consumed stored credential state, with active owner and original expiry checks. Results are minimal and frozen. Failed lookups do not prune or mutate. Rotation and revocation preserve binding hash in consumed history; identity deletion clears owned rows and tombstones. The refresh lookup is a credential/CSRF-scope preflight; atomic rotation still rechecks transport and ownership, and no principal or issuance authority is conferred.

The added spec covers real nonce consumption and issuer setup, principal resolution, refresh rotation/reuse/revocation, malformed and adversarial input, immutability, legacy compatibility, expiry and deletion. No HTTP, schema, provider, dependency, or public wire changes appear in scope. This approves only the reviewed source snapshot; future adapter wiring requires its separately reviewed trusted hash boundary.

Reviewed canonical source SHA-256:

- `apps/api/src/auth/sessions-v2/v2-session-issuer.ts` — `22ead997fdcf7dfa70504afa0c1afd6d434a16f12429e9f9401dd324f102fbc6`
- `apps/api/src/auth/sessions-v2/v2-principal-resolver.ts` — `f008ad05ce12f7e8e4e37e908577dc3d3afb6ff1e5bb1d5544c990cfdb7c35e8`
- `apps/api/src/auth/sessions-v2/v2-web-session-binding.ts` — `5ff037900ef875d119a6a5b397b571873acfeece488a43f29a991776131ef78b`
- `apps/api/src/auth/sessions-v2/v2-web-session-binding.spec.ts` — `384baf740707fe87d3a1fb901814b6e969e868ac9baa915ce1f494b93bf613e0`

Reviewer tools used: 4, including this handoff. No tests run; root owns QA.
