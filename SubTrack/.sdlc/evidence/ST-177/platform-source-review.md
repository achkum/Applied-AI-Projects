# ST-177 independent platform source review

Reviewed branch `st/ST-177-dev-web-otp`, HEAD `a97b2ae839120d9db87210b57658cb54c5879e88` (base `a97b2ae839120d9db87210b57658cb54c5879e88`). Scope: Constitution, ST-177 task, ADR-0010, accepted implementation/security evidence, OTP OpenAPI schemas, changed source and focused tests. This is source review only; no tests, lint, typecheck, or full suite were run by this reviewer.

**Verdict: approve; previous minor finding is fixed.** The verify settlement-failure path now removes the consumed challenge code and metadata from the internal sink before returning the generic error, and the focused spec asserts the sink is empty. I rechecked this path and the start-settlement no-publication assertion; no blocker found. Shared nonce wiring, preflight/reserve/rotate ordering, challenge purpose and chain binding, fail-closed config, normalized identifier binding, bounded stores, and response shapes remain intact. The final limiter now rejects rollback against the newest retained event; focused cases cover direct socket IP despite forwarding headers and mapped IPv4, identifier limits and sliding boundary, rollback, and invalid store capacities.

Reviewed-file SHA-256 manifest (refreshed after direct inspection of the final rate-limit changes; changed source, tests, and runtime configuration):
- `.env.example` `ab621f6957780834b5499fba6d8a4f6a6fc21f166fcecfab4124d07a4d01a16d`
- `apps/api/package.json` `75d9989af7c1a005df9b746d01a7606c87c9253fb750ff9e11c96c4fdbdefe0f`
- `pnpm-lock.yaml` `c2d6048ce6681e8ff760eebf0d0f230d089ce82d54e5dab91e80fdff4954ec41`
- `apps/api/src/app.module.ts` `607a07f5ec9d1736ad8fbf2f72046e3a92367ca9534df6b7f43ff6629785271f`
- `apps/api/src/config.ts` `1e0ece2e539ffa9321131b4ba47cab3434caf6f9b86c23bbbe41d8f167c2b6bf`
- `apps/api/src/config.spec.ts` `32219da5923ed2ec84d9482ff0f6ed611adeb2a7fec5ffad8cef11940d876f36`
- `apps/api/src/auth/browser-nonce/browser-nonce-http.module.ts` `d2086a76a0ce95b83c196f2ad20e8a4c9d05f6ccfb6e22a48fd8f89cf11a758b`
- `apps/api/src/auth/browser-nonce/browser-nonce.ts` `ce00e51f672f5aef5a17f7e16af05514d1b9a1d02accd68e33e035d2cd2c819b`
- `apps/api/src/auth/proofs-v2/otp-proof-producer.ts` `7a48ee31a0bc07f1570ab03f49ba93a421c42761a58137151fe61680976347ed`
- `apps/api/src/auth/proofs-v2/proof-store.ts` `a31974f590ad4dbf18950edf1605fab9b45a83e78610a0506b221595fb1d5b8f`
- `apps/api/src/auth/otp-v2/otp-http.ts` `3da4941f6a13cdec3157f40a63df4e5e1607780d7715876d0fa8e12691e037e8`
- `apps/api/src/auth/otp-v2/otp-http.spec.ts` `24f6d9f7d179f30fc32492968f2117c35fc2b02d94acb0b66afe498f3243395d`
- `apps/api/test/otp-v2-http.spec.ts` `081c9158bde2854cbec6af1d2f6d2e5e35ecdf581711d1b4064fbb2b627d9dfa`

Limits: this review does not establish test, lint, typecheck, CI, or runtime success. Those checks remain pending the conductor/QA run.
