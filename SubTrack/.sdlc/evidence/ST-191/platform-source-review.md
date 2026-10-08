# ST-191 architect-platform source review

Decision: APPROVE

The four source files stay within ST-191’s approved internal seam. Issuance accepts an optional strict lowercase 64-hex browser-cookie hash, rejects it for mobile and malformed inputs before proof consumption, and copies it into the session record without changing the existing proof context or response. Legacy records can omit it; both new lookup ports deny them.

The helper accepts only canonical base64url for 32 decoded bytes and hashes those bytes with the specified fixed domain. Current-session lookup requires the exact owner context, live active web row, cookie hash, exact origin, and valid observed/trusted clocks. Refresh lookup derives ownership only from the matched active row or retained consumed credential; it returns only the approved frozen scope. The consumed path remains a CSRF/reuse scope and does not authorize principals. Rotation still checks its own current credential, transport and owner conditions. Hash metadata is copied and validated at the principal boundary, forbidden on mobile, retained in rotation/revocation history until original expiry, and cleared on identity deletion.

The focused 255-line spec exercises the real nonce-to-proof-to-issuer path, hash validation, owner/origin/time failures, frozen minimal outputs, legacy compatibility, consumed credential reuse, revocation/deletion, and principal rejection. No HTTP adapter, public contract, schema, provider, new state, or lifetime change appears in the reviewed source. The root-reported lint, typecheck, API tests, and build cover integration; this source review does not claim separate CI execution.

SHA-256 (canonical relative paths):
- `apps/api/src/auth/sessions-v2/v2-session-issuer.ts`: `22ead997fdcf7dfa70504afa0c1afd6d434a16f12429e9f9401dd324f102fbc6`
- `apps/api/src/auth/sessions-v2/v2-principal-resolver.ts`: `f008ad05ce12f7e8e4e37e908577dc3d3afb6ff1e5bb1d5544c990cfdb7c35e8`
- `apps/api/src/auth/sessions-v2/v2-web-session-binding.ts`: `5ff037900ef875d119a6a5b397b571873acfeece488a43f29a991776131ef78b`
- `apps/api/src/auth/sessions-v2/v2-web-session-binding.spec.ts`: `384baf740707fe87d3a1fb901814b6e969e868ac9baa915ce1f494b93bf613e0`
