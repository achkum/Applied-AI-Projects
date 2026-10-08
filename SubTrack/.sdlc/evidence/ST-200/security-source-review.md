# ST-200 security source review

**Decision: APPROVE for the bounded internal resolver source slice.**

The resolver establishes its owner from the real verified mobile V2 principal and then gives the registered-contact reader a frozen one-field `{ userId }` scope derived from that principal. It does not accept an identifier, owner, or contact selector from the caller. The authority is constructed only after verified-claim, current-principal, and owned current-session checks; after the contact await, the resolver rechecks time/token validity and rereads and validates the complete owned mobile session row before returning the frozen authority. This gives the resolver a final current-owner linearization point. The descriptor-safe snapshots and strict promise/thenable handling prevent caller-controlled getters or hostile thenables from changing scope during these checks.

The source and focused cases cover malformed verified claims, principal/contact getter and thenable behavior, async session-read rejection, contact result extras/getters, changes to the full session record while contact lookup is pending, and expiry during that await. The contact port receives no raw identifier or client-selected channel. The token is verified by the supplied V2 verifier; the resolver does not decode an unverified JWT or fall back to v1/web identity.

**Scope limitation:** approval covers this resolver only. Any future HTTP handler or proof/session/deletion effect must perform its own fresh principal, token, current-owner, and transport checks at the effect’s linearization point, and must define retry/idempotency behavior for effects that can commit after authority becomes stale. This review does not approve a provider, persistent contact reader, route, wiring, or deletion behavior.

Reviewed source SHA-256 values:

- `apps/api/src/auth/proofs-v2/mobile-deletion-otp-authority.ts`: `c49cdca94ab5a610db67fa68d60c6ff7a59eb28ecfe882bc3e19ce6fdf37d6cf`
- `apps/api/src/auth/proofs-v2/deletion-otp-proof-producer.ts`: `1224d4f12e3d751c46cec52221bd9b853ba0af7c3f8b05c5d6c7d3e3977ee227`

## Focused test source review

Coverage decision: **APPROVE.** The focused spec exercises the material security boundaries identified above: actual simulator-issued mobile credentials, deleted/revoked/foreign/web/expired credentials before contact lookup, principal revalidation, ownership loss and expiration during asynchronous work, full session-row validation after contact lookup, strict contact shape and getter rejection, hostile thenable rejection, and derived frozen owner context. These cases substantiate the resolver-only approval; they do not extend approval to downstream HTTP effects or integrations.

Reviewed spec SHA-256: `apps/api/src/auth/proofs-v2/mobile-deletion-otp-authority.spec.ts` — `76f5a339f1ad060e5c4cf275badf3528ea1ad5b9f40432bd1537ede4295fae5a`. This matches the spec hash recorded in `source-freeze.json`.
