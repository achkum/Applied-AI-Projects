# ST-180 Platform Preimplementation Review

**Decision: APPROVE**, with the canonical JSON check below mandatory in the task contract and implementation.

The narrowed scope is architecturally sound and implementable as an isolated development/test Ed25519 access-token core. The duplicate-key requirement is implementable without a custom parser: after bounded canonical base64url decoding and strict UTF-8 validation, parse JSON, validate the exact plain-object shape and all field types/values, then require the original decoded JSON bytes to equal the UTF-8 bytes of `JSON.stringify(parsedObject)`. This rejects duplicate keys because parsing removes duplicate occurrences, as well as whitespace, alternate escapes/numbers, and trailing data. Apply this independently to the header and payload. Accept insertion order from the parsed object; the issuer itself should emit a fixed field order. This is an internal issuer/consumer format and makes no general JWT interoperability claim.

## Architectural assessment

The boundary fits ADR-0010: it is additive and isolated, leaves every v1 path and `JwtService` behavior intact, and makes no runtime, migration, provider, rollout, or production-readiness claim. The fixed v2 issuer/audience and token type/version provide semantic separation even when a test deliberately supplies the same key to both token implementations. This negative test is useful but does not prove key separation. Any future integration must provision a distinct v2 keypair; this class must neither load v1 configuration nor generate fallback keys.

The class is implementable with Node `KeyObject`, `sign(null, data, privateKey)`, and `verify(null, data, publicKey, signature)`. Validate constructor inputs once: explicit development environment and enabled flag must be true; key objects must be Ed25519 with private/public roles respectively; issuer and audience must equal the reviewed fixed v2 constants and be nonempty. Do not infer a public key from a private key or silently substitute defaults. A mismatched but individually valid keypair can make local issuance unverifiable, so either check pair correspondence at construction with a fixed challenge/signature or document that pairing is guaranteed by the caller; a startup check is preferable.

The specified UUID restriction is coherent for internal server-owned identity/session identifiers. It deliberately excludes existing arbitrary v1 IDs and must not be widened for convenience. Capture trusted constructor values and key references; use an injected clock whose result is checked as a safe nonnegative integer millisecond value on every call. Issuance must use `floor(ms / 1000)` and fixed 900-second expiry with safe-integer arithmetic. Verification must reject future `iat`, accept only while `nowSeconds < exp`, and require `exp === iat + 900`.

## Mandatory implementation constraints

- Keep implementation and adjacent spec inside the two source paths in the draft. No export barrel, module wiring, HTTP/session integration, environment reads, storage, logs, dependency additions, or v1 edits.
- Use exactly fixed `iss = urn:subtrack:auth:v2:development`, `aud = urn:subtrack:api:v2:development`, `typ = subtrack-v2-access+jwt`, `alg = EdDSA`, and `ver = 2`; reject all other or extra/missing fields. Never select an algorithm from an untrusted header.
- Reject oversized input before decoding; require strict three-segment, nonempty, ASCII, canonical unpadded base64url and a 64-byte Ed25519 signature. Validate decoded JSON as strict UTF-8. After `JSON.parse`, require the exact plain-object fields/types/values and byte equality with UTF-8 `JSON.stringify(parsedObject)` for both header and payload. This canonical check is the duplicate-key rejection mechanism; do not replace it with post-parse field checks alone.
- Use generic externally visible failures and do not include token contents, claims, or key material. Return only the validated minimal claims, frozen if the API exposes a mutable object.
- Tests must exercise real ephemeral Ed25519 keys, signing and verification, v1-shaped rejection under a shared test key, wrong key, namespace/header/version errors, duplicate/missing/extra fields, malformed and noncanonical encodings, UUID/time/expiry bounds, tampering, size limit, and clock exceptions. Do not use literal private keys or real identity data.
- Successful signature verification establishes token validity only. It does not prove a session remains active, belongs to the current owner, or is authorized. Future request handling must perform separately reviewed, current, consistent, scoped session-owner validation before treating claims as a principal.

## Governance and scope

AGENTS.md limits code to task `allowed_paths`; the listed paths include the new core/spec and SDLC metadata/evidence. The Constitution requires tests for new behavior, no secrets or PII, and truthful status. ADR-0010 is accepted as contract-only and explicitly withholds runtime and rollout approval. The draft appropriately defers production keys, deployment, schema, provider, and HTTP/session work. Keep `development` namespace language tied to this dev/test-only task and make no production isolation claim.

## Actual calls / implementation surface

The intended Node crypto calls are `sign(null, signingInput, privateKey)` and `verify(null, signingInput, publicKey, signature)`, with explicit Ed25519 `KeyObject`s. Parsing should follow size/segment/canonical-base64url checks; strict parsing and exact canonical-byte comparison enforce the token grammar. Header values must not select verification behavior: use the configured public key and Ed25519 algorithm. A practical order is: bound and split input; canonical-decode bounded header, payload, and signature; enforce 64-byte signature; parse and validate the exact header shape plus canonical JSON bytes; verify with the configured public key; parse and validate exact payload claims plus canonical JSON bytes; then validate time and return claims. Apply the same generic external failure for every rejection.

This independent review made no repository source, Git state, QA, configuration, or dependency changes. Artifact-call accounting: this final artifact update is the one additional tool call authorized by the parent after the original four-call cap; it is not counted within that cap.
