# ST-180 security source review

**Decision: APPROVE**

Reviewed the frozen source and spec against the ST-180 task draft, platform/security preimplementation reviews, SubTrack repository instructions, the Constitution, and ADR-0010. This approval is limited to the isolated internal development/test token core in these exact files. It does not approve wiring, runtime authentication/authorization, deployment, production readiness, or any v1 changes.

The source implements the reviewed Ed25519 design as specified: it requires an explicit development/enabled config, snapshots exact own data descriptors, checks private/public Ed25519 `KeyObject` roles and matching SPKI public bytes, and fixes issuer/audience/header/version internally. Issuance uses canonical lowercase RFC UUIDs, a checked injected millisecond clock, and exactly 900 seconds. Verification bounds and checks ASCII input, requires three segments and canonical unpadded base64url, enforces a 64-byte signature, uses strict UTF-8 decoding, checks the exact canonical JSON byte representation (which rejects duplicate keys), verifies using the configured Ed25519 public key, validates exact claim keys and time bounds, and returns frozen minimal claims. Errors collapse to `Invalid access token`.

The adjacent spec exercises real generated Ed25519 pairs, round trips, a v1-shaped token with the same fixture key, mismatched keys and key roles, config descriptors/extras, fixed namespace/header/version checks, duplicate keys, malformed claims/IDs, TTL and clock boundaries, malformed/noncanonical segments, invalid UTF-8, oversize input, tampering, and generic errors. The review found no source-level security gap requiring changes within this isolated scope.

This token verifier establishes only validity of the credential bytes under this configured key. It does not establish an active session, current ownership, principal context, or authorization. Any later runtime must add separately reviewed current session-owner validation. The implementation also cannot prove that an externally supplied v2 key is globally distinct from all v1 keys; integration must provision a separate v2 keypair. These limits match the reviewed task boundary and ADR-0010.

**Severity findings:** none.

**Exact reviewed file SHA-256:**

- `v2-access-token.ts`: `a3799775106490d50c599970b50dcfd40fcc8426d836a86f68c6a3d046bbf096`
- `v2-access-token.spec.ts`: `dec2447e44bd61c2bd062c97d72e72614e9a4b1db6d6274b5c91097ebe444d9c`

**QA:** no tests, lint, typecheck, or build were run or claimed. The live application source was absent as expected for this isolated review and is not treated as a defect.

**Actual tool calls:** 3 total: (1) locate files and compute frozen source/spec hashes, (2) read frozen source/spec/task/platform/security reviews and repository instructions, (3) read Constitution/ADR-0010 and inspect repo status/task path, plus write this review artifact. No source, Git, configuration, or dependency changes were made; only this review artifact was written.
