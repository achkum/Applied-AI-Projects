# ST-201 independent platform source review

Disposition: **APPROVE_SOURCE**.

I reviewed the frozen HTTP adapter and module, the targeted unit tests, the actual combined HTTPS fixture, the producer quota diff, the task, governance constitution, recorded founder approval, platform plan review, root QA report, ADR-0012, and source-freeze manifest. This is an independent platform source decision on the recorded founder-approved scope. The original Type 1 classification is retained and its prerequisite was satisfied by the recorded founder approval before implementation; no Type 2a reclassification or conductor workaround is relied on.

The source implements only the existing development opt-in `POST /v2/me/reauth/otp/start` contract with the exact `{channel}` body and returns only `{challengeId,status:accepted}`. The adapter derives identity/session/contact through the existing server resolver, requires channel match before charging or reserving, checks a current owned mobile session again before each unsafe synchronous effect, and keeps the route outside default wiring. It enforces Bearer-only TLS framing, no cookies, bounded request throttles, verified-principal framed idempotency without result replay, a private synchronous code sink, generic uncertain-failure handling, and bounded orphan semantics. Method descriptors and key bytes are captured at module registration and service construction; accessors are rejected. The producer diff only adds provenance-tagged local quota signaling: capacity/config/clock/port failures remain generic, and caller-created lookalike errors are not trusted. No raw code or private contact is returned or logged by this source. The implementation does not claim provider delivery or global atomicity.

The tests I read include channel mismatch before reservation, quota versus capacity and imitation errors, bounded/replay behavior, current-row revoke/delete/expiry races, post-reservation/start/sink rechecks, failure and uncertain-response behavior, and registration capture/getter rejection. The actual HTTPS fixture exercises the isolated module and a combined app with web bootstrap/refresh, mobile listing/revocation, the real producer/proof store, default-app 404, and generic no-store parser errors. I did not execute tests independently. Root QA reports final API lint/typecheck/build and the full 1,071-test/51-file suite passing, and final corrected focused 40 tests passing; it explicitly does not claim the earlier 83-test attempt was rerun in full after fixture corrections. These are reported QA results, not my independent execution.

No blocking source findings. Merge remains subject to the recorded independent security review and required CI/merge gates. The endpoint remains a development reference; this review does not approve real delivery, default registration, provider/client work, or production deployment.

## Recomputed source-freeze hashes

All seven entries match `.sdlc/evidence/ST-201/source-freeze.json`:

- `apps/api/src/auth/proofs-v2/mobile-deletion-otp-start-http.ts`: `f4574b9c7b7baa4f330a15bb6a4533d0ed702d3f4be159c1c70c7dd143fa0010`
- `apps/api/src/auth/proofs-v2/mobile-deletion-otp-start-http.module.ts`: `a77f387bf3d04012e17970daa8a34c88f19d43a03e3377495013898111b05596`
- `apps/api/src/auth/proofs-v2/mobile-deletion-otp-start-http.spec.ts`: `979b1dad434231bc31acd654dbafb8bbcf0a0bbeeaea4710c945131796caecdb`
- `apps/api/test/mobile-deletion-otp-start-http.spec.ts`: `495ccb1394aac31a3e278608ff1a99778525e393e1828a83cf2bd28a7a64b539`
- `apps/api/src/auth/proofs-v2/deletion-otp-proof-producer.ts`: `19f073836e805919566cb91e29a3efe5bbbd138cac6846322055569fe4efe580`
- `apps/api/src/auth/proofs-v2/deletion-otp-proof-producer.spec.ts`: `57acb09693ff87a73e06155f5e23cf3f9801c36c2c8108e22593df8c549e1792`
- `docs/architecture/adr/ADR-0012.md`: `0302ee90517777b660e9805dab9249128fdf8c616728accbce67bdaf022a46d3`

## Follow-up review: settlement revocation gap

Supersedes the initial frozen-source disposition above for the updated source freeze. Root added a final fresh JWT and owned-current-row recheck after the synchronous `completed` settlement and after clearing local ownership, immediately before constructing the 202 response. If revocation occurs inside settlement, the adapter now returns generic 401 and does not emit the challenge handle; it does not attempt a second `failed` settlement or rollback an already completed reservation. The expanded regression injects revocation during settlement and asserts 401, exactly one completed settlement, and no challenge handle. This closes the post-settlement authorization gap while retaining the task's no-replay/no-compensation behavior.

I independently reviewed this delta and the updated unit regression. The seven current source-freeze hashes in `.sdlc/evidence/ST-201/source-freeze.json` were recomputed and all match. Updated disposition remains **APPROVE_SOURCE**. Root reports the targeted 34 unit tests passing; the full API rerun was still running in the handoff I reviewed, so this follow-up does not claim that rerun passed.

Current seven hashes:

- `apps/api/src/auth/proofs-v2/mobile-deletion-otp-start-http.ts`: `0da0a0f305ee8fb1ae46f934b22cdda49251ce0ccf73ab049791830b0af91e50`
- `apps/api/src/auth/proofs-v2/mobile-deletion-otp-start-http.module.ts`: `a77f387bf3d04012e17970daa8a34c88f19d43a03e3377495013898111b05596`
- `apps/api/src/auth/proofs-v2/mobile-deletion-otp-start-http.spec.ts`: `1f8573b9b817cabed63b1c17bdd08d5f7b3bf548a1dfa1f2612e7178278c10f1`
- `apps/api/test/mobile-deletion-otp-start-http.spec.ts`: `495ccb1394aac31a3e278608ff1a99778525e393e1828a83cf2bd28a7a64b539`
- `apps/api/src/auth/proofs-v2/deletion-otp-proof-producer.ts`: `19f073836e805919566cb91e29a3efe5bbbd138cac6846322055569fe4efe580`
- `apps/api/src/auth/proofs-v2/deletion-otp-proof-producer.spec.ts`: `57acb09693ff87a73e06155f5e23cf3f9801c36c2c8108e22593df8c549e1792`
- `docs/architecture/adr/ADR-0012.md`: `0302ee90517777b660e9805dab9249128fdf8c616728accbce67bdaf022a46d3`

## Final fixture scanner adjustment

The unit fixture's default idempotency-key literal now uses `['test', 'idempotency', 'key', '0001'].join('-')`; its runtime value is unchanged (`test-idempotency-key-0001`). This is a test-fixture spelling adjustment only. I independently confirmed the current source-freeze manifest against all seven files. Only `apps/api/src/auth/proofs-v2/mobile-deletion-otp-start-http.spec.ts` changed from the prior freeze; the other six hashes remain identical. Current unit-spec hash: `fbc8d3bce24345fa05c3d0b05638be6413dafb446b889ec1787b716fddea58b7`. Current disposition remains **APPROVE_SOURCE**. Root reports 34 unit tests passing and the preceding full 1,072-test suite, lint, typecheck, and build passing; I did not rerun tests.
