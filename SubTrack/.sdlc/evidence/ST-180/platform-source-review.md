# ST-180 Platform Source Review

**Decision: APPROVE**

This review covers only the exact frozen source and spec identified by the hashes below. The source follows the approved internal dev/test-only Ed25519 boundary: fixed v2 issuer, audience, token type, algorithm, version, and 900-second TTL; explicit development/enabled config; strict own-data config snapshot; supplied Ed25519 key objects with private/public role and pair-match validation; and no environment reads, v1 JwtService use, fallback keys, or runtime integration.

Verification bounds token input before decoding or cryptographic work, requires three nonempty ASCII segments and canonical unpadded base64url, decodes UTF-8 strictly, and enforces exact canonical JSON bytes. The canonical JSON comparison rejects duplicate keys as required. It verifies with the configured public key rather than selecting an algorithm from the header, checks the exact payload shape and fixed namespace/version/UUID/time/TTL constraints, maps failures to a generic message, and returns frozen minimal claims.

The adjacent tests use generated ephemeral Ed25519 keys and cover issue/verify, v1-shaped rejection under a shared fixture key, key/config constraints including key mismatch, namespace/header/version errors, duplicate/missing/extra fields, malformed and noncanonical inputs, UUID and clock failures, TTL/future/expiry boundaries, invalid UTF-8, oversized tokens, and signature tampering. The source and spec remain limited to the proposed files. No concrete blocking platform source or test gap was found. This review does not establish production key separation, active session ownership, principal authentication, authorization, or rollout readiness.

**Exact reviewed file hashes (SHA-256):**

- `.setup/ST180-frozen-candidate/v2-access-token.ts`: `a3799775106490d50c599970b50dcfd40fcc8426d836a86f68c6a3d046bbf096`
- `.setup/ST180-frozen-candidate/v2-access-token.spec.ts`: `dec2447e44bd61c2bd062c97d72e72614e9a4b1db6d6274b5c91097ebe444d9c`

**QA:** No QA was run or independently verified. This review does not attest to the reported eight tests, lint, typecheck, build, full repository QA, Git state, or CI.

**Actual tool calls:** 5 total: one unavailable skill-read attempt, two shell calls for discovery and frozen artifact inspection, one shell call for Constitution/ADR-0010 review, hash calculation and the initial artifact write, and one corrective artifact-only call. The initial write used an unquoted heredoc; shell expansion consumed Markdown backticks and malformed portions of the file. This corrective write replaces that artifact. No source, configuration, or Git changes were made; the only filesystem write was this review artifact.
