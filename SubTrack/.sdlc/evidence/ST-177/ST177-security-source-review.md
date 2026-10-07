# ST177 security/privacy source review

Verdict: APPROVE source-level review for the bounded development reference; no blocking security finding in the inspected worktree.
Scope: ST177 source against Constitution, task contract, ADR-0010, API_CONTRACT.md, OpenAPI OTP schemas, and the accepted preimplementation security review.
Reviewed base: a97b2ae839120d9db87210b57658cb54c5879e88; working tree branch st/ST-177-dev-web-otp.
Source hash manifest (SHA-256; paths relative to SubTrack):
- apps/api/src/app.module.ts — 607a07f5ec9d1736ad8fbf2f72046e3a92367ca9534df6b7f43ff6629785271f
- apps/api/src/auth/browser-nonce/browser-nonce-http.module.ts — d2086a76a0ce95b83c196f2ad20e8a4c9d05f6ccfb6e22a48fd8f89cf11a758b
- apps/api/src/auth/browser-nonce/browser-nonce.ts — ce00e51f672f5aef5a17f7e16af05514d1b9a1d02accd68e33e035d2cd2c819b
- apps/api/src/auth/proofs-v2/otp-proof-producer.ts — 7a48ee31a0bc07f1570ab03f49ba93a421c42761a58137151fe61680976347ed
- apps/api/src/auth/proofs-v2/proof-store.ts — a31974f590ad4dbf18950edf1605fab9b45a83e78610a0506b221595fb1d5b8f
- apps/api/src/auth/otp-v2/otp-http.ts — 3da4941f6a13cdec3157f40a63df4e5e1607780d7715876d0fa8e12691e037e8
- apps/api/src/config.ts — 1e0ece2e539ffa9321131b4ba47cab3434caf6f9b86c23bbbe41d8f167c2b6bf
- apps/api/src/config.spec.ts — 32219da5923ed2ec84d9482ff0f6ed611adeb2a7fec5ffad8cef11940d876f36
- apps/api/test/otp-v2-http.spec.ts — 081c9158bde2854cbec6af1d2f6d2e5e35ecdf581711d1b4064fbb2b627d9dfa
- apps/api/src/auth/otp-v2/otp-http.spec.ts — 24f6d9f7d179f30fc32492968f2117c35fc2b02d94acb0b66afe498f3243395d
- .env.example — ab621f6957780834b5499fba6d8a4f6a6fc21f166fcecfab4124d07a4d01a16d
- apps/api/package.json — 75d9989af7c1a005df9b746d01a7606c87c9253fb750ff9e11c96c4fdbdefe0f
- pnpm-lock.yaml — c2d6048ce6681e8ff760eebf0d0f230d089ce82d54e5dab91e80fdff4954ec41

Security controls confirmed:
- OTP is opt-in and configuration only permits it in development alongside v2 and browser nonce; four decoded 32-byte keys are distinct. Disabled routes are conditionally absent.
- Bootstrap and OTP share the same nonce guard and idempotency repository. Exact raw Origin/nonce/idempotency evidence and duplicate binding cookies are rejected in transport middleware/handler. The sequence is direct-socket throttling, nonmutating bound preflight, synchronous reservation, synchronous revalidated rotation with no await, then producer work.
- Rate limits use HMAC'd direct socket IP and normalized identifier keys, ignore forwarding headers, prune sliding buckets, cap active records at 10,000, and fail closed at limits/capacity. A new guard rejects out-of-order timestamps; challenge, proof, and internal development code stores are TTL-bounded and capped.
- Challenge purpose/context comes from server-held metadata. Producer binds normalized identifier hash, exact origin, browser chain, and purpose; proof issuance maps only to enrollment or step-up. HTTP shapes are exact; success responses expose only the contract fields; failures and duplicate operations do not replay secrets.
- Settlement precedes sink publication and secret-bearing success fields. On verify settlement failure the challenge is removed; no proof or rotated nonce is returned. No provider delivery, v1 inbox, stdout, database, principal, login, or session behavior was found in this slice.

Failure coverage additionally checks settlement and sink withdrawal, ignored forwarded IP headers, IPv4-mapped socket normalization, the 10-start and 5-per-identifier limits, expiry and clock rollback, and capacity constructor bounds. Validation: I inspected source and tests but did not run them. Conductor reports 366 API tests across 24 files, lint and typecheck passed at final source, and build passed before the final limiter rollback delta. Exact-head CI remains pending.
This approval is not production, provider, persistence, deployment, or rollout approval.
