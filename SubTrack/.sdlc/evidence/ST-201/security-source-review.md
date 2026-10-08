# ST-201 independent security source review

**Decision: BLOCKED (Medium).** The scoped implementation largely preserves the approved security boundary, but the success path omits the required fresh authorization check after settlement and immediately before the 202 response. This review is limited to ST-201 and does not approve or infer ST-198 authority.

## Finding

**Medium — missing final current-authority check before success response.** In `apps/api/src/auth/proofs-v2/mobile-deletion-otp-start-http.ts`, the final `recheck()` is performed before `idempotency.settle(..., 'completed')`; the code then clears `owner` and emits 202 without another token/current-session-row check. The approved contract requires freshness before settle and the 202 response. A synchronous settle port can revoke/delete the session as part of its call (or a state change can otherwise occur after the last check); the handler will still return accepted to a no-longer-current principal. This does not expose the code, but it violates the stated authorization ordering and the coverage should assert revocation from the settle port prevents a 202. Recheck after successful settlement and before `send(202, ...)`; if it fails, return the generic auth failure without retry, restore, or a second settlement attempt. Preserve the already-completed reservation and document the resulting bounded orphan behavior.

No other High/Critical issue was found in the reviewed ST-201 source. The transport branch requires one bearer and rejects all Cookie headers, enforces direct TLS, raw-header ambiguity/framing and body shape, and strips query paths. Authority is resolved through the real server resolver and current owned mobile row; synchronous checks precede reserve/start/sink/settle, with refresh after async authority resolution. The request and core throttles both enforce 5 per identity and 300 global per minute, with bounded identity maps; HTTP quota is charged before reservation. Idempotency is reserved before challenge creation and does not replay payloads. Only locally branded producer quota errors map to 429; producer capacity and port/config/clock failures stay generic. The code sink is synchronous and private; 202 has only challengeId/status, with no code, proof, token, expiry, cookie, delivery claim, or raw trusted-port details. Failure handling does not retry or restore committed state and avoids a second response after headers are sent.

## Classification and validation evidence

I preserved the approved channel interpretation: `channel` is required by the existing contract and must match the server-resolved contact. I also preserved the accepted idempotency behavior: the existing guard intentionally uses generic `AUTH_RESTART_REQUIRED` for both duplicate and its internal denial/capacity path, so that established denial remains a generic 409; unexpected reservation-port faults and malformed reservation results map to generic 500. The quota WeakSet provenance is separate and does not trust public error instances.

Reviewed the frozen HTTP adapter and module, producer quota change, their unit/producer specs, and the HTTPS integration spec sections for real-CA isolated/combined registration, default 404, no-store parser errors, no replay, transport rejection, quotas, ownership races, and sink/settle/response failure behavior. The test/evidence report records 1,071 API tests, lint, strict typecheck, and build passing; I did not rerun tests for this source-only review. No source or tests were modified.

## Independently recomputed ST-201 freeze hashes

f4574b9c7b7baa4f330a15bb6a4533d0ed702d3f4be159c1c70c7dd143fa0010  `apps/api/src/auth/proofs-v2/mobile-deletion-otp-start-http.ts`
a77f387bf3d04012e17970daa8a34c88f19d43a03e3377495013898111b05596  `apps/api/src/auth/proofs-v2/mobile-deletion-otp-start-http.module.ts`
979b1dad434231bc31acd654dbafb8bbcf0a0bbeeaea4710c945131796caecdb  `apps/api/src/auth/proofs-v2/mobile-deletion-otp-start-http.spec.ts`
495ccb1394aac31a3e278608ff1a99778525e393e1828a83cf2bd28a7a64b539  `apps/api/test/mobile-deletion-otp-start-http.spec.ts`
19f073836e805919566cb91e29a3efe5bbbd138cac6846322055569fe4efe580  `apps/api/src/auth/proofs-v2/deletion-otp-proof-producer.ts`
57acb09693ff87a73e06155f5e23cf3f9801c36c2c8108e22593df8c549e1792  `apps/api/src/auth/proofs-v2/deletion-otp-proof-producer.spec.ts`
0302ee90517777b660e9805dab9249128fdf8c616728accbce67bdaf022a46d3  `docs/architecture/adr/ADR-0012.md`

## Follow-up review (2026-10-08)

**Current disposition: APPROVE_SOURCE.** The Medium finding above is retained as history and is resolved in the current frozen source. After a strict successful `completed` settlement and clearing the locally owned reservation handle, the handler now rechecks the verified token and current owned mobile row immediately before emitting 202. If settlement revokes the session, this final check returns generic 401; it does not emit the challenge handle or attempt failed settlement/rollback. The added regression case revokes from the settle port and asserts 401, exactly one completed settlement, and no challengeId in the response. This closes the ordering gap without replay or cleanup behavior.

I independently recomputed all seven source-freeze hashes; each matches `.sdlc/evidence/ST-201/source-freeze.json`:

0da0a0f305ee8fb1ae46f934b22cdda49251ce0ccf73ab049791830b0af91e50  `apps/api/src/auth/proofs-v2/mobile-deletion-otp-start-http.ts`
a77f387bf3d04012e17970daa8a34c88f19d43a03e3377495013898111b05596  `apps/api/src/auth/proofs-v2/mobile-deletion-otp-start-http.module.ts`
1f8573b9b817cabed63b1c17bdd08d5f7b3bf548a1dfa1f2612e7178278c10f1  `apps/api/src/auth/proofs-v2/mobile-deletion-otp-start-http.spec.ts`
495ccb1394aac31a3e278608ff1a99778525e393e1828a83cf2bd28a7a64b539  `apps/api/test/mobile-deletion-otp-start-http.spec.ts`
19f073836e805919566cb91e29a3efe5bbbd138cac6846322055569fe4efe580  `apps/api/src/auth/proofs-v2/deletion-otp-proof-producer.ts`
57acb09693ff87a73e06155f5e23cf3f9801c36c2c8108e22593df8c549e1792  `apps/api/src/auth/proofs-v2/deletion-otp-proof-producer.spec.ts`
0302ee90517777b660e9805dab9249128fdf8c616728accbce67bdaf022a46d3  `docs/architecture/adr/ADR-0012.md`

## Scanner-only fixture follow-up (2026-10-08)

**Disposition remains APPROVE_SOURCE.** The fixture default key now uses `['test', 'idempotency', 'key', '0001'].join('-')`, preserving the exact runtime value while avoiding the scanner's generic `api-key` false positive. No runtime source changed. I independently recomputed all seven hashes and confirmed they match the updated freeze manifest; only `apps/api/src/auth/proofs-v2/mobile-deletion-otp-start-http.spec.ts` changed, to `fbc8d3bce24345fa05c3d0b05638be6413dafb446b889ec1787b716fddea58b7`. The supplied 34 focused unit tests and preceding full API/lint/typecheck/build results are recorded as external validation evidence; I did not run tests.

## CI timeout follow-up (2026-10-08)

**Disposition remains APPROVE_SOURCE.** The only change is a dedicated 30-second timeout on the real global-quota integration test, with a comment explaining the shared-CI headroom. The test still creates 61 genuine principals, performs all 301 requests, expects the boundary response to be 429, and asserts exactly 300 reservations and private codes. No source, threshold, assertion, or quota behavior changed. I independently recomputed all seven frozen-file hashes and confirmed they match the manifest; only `apps/api/src/auth/proofs-v2/mobile-deletion-otp-start-http.spec.ts` changed, now `86cd1cfe99b69ddfe1fa973750fe3cce1ec1f6660cdc27ba613f87e54648335e`. Reported focused test results are recorded as provided; I did not run tests.
