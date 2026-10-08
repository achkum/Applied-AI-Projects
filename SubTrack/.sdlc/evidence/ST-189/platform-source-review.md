# ST-189 platform source review

**Decision: APPROVE.** The reviewed source implements the accepted platform plan’s terminal session nonce seam within the two-file source scope. This approval covers the in-process implementation and adapter boundary; it does not attest HTTP behavior or an atomic proof/session transaction.

The guard validates the fixed `session` purpose, canonical allowlisted origin, HTTPS or explicit loopback exception, both 43-character credentials, safe nonnegative clock, and clock-plus-TTL bound before calling the terminal port. Missing ports and accessor/non-function ports fail closed; the adapter method is resolved without invoking accessors and is bound to its store receiver. The in-memory port checks the clock before pruning, compares both hashes, exact origin and session purpose, issue/expiry bounds, and exact five-minute TTL, then synchronously deletes only the matching row and returns no successor. Ordinary cookie, origin, purpose, backdated, and invalid-clock failures preserve the matching live row. Successful context is derived from a strict own-data-property snapshot, validated against expected hashes/origin/purpose and time bounds, and returned as a frozen minimal context. Malformed adapter outcomes produce the generic failure with no fallback or retry, including after an uncertain/committed consume.

The spec exercises successful consumption and empty snapshot, replay/preflight/rotation failure, OTP-purpose rejection, mismatch preservation, invalid clocks and backdating, expiry and unrelated-row preservation, both terminal-vs-terminal and terminal-vs-rotation orderings, absent/accessor ports, malformed result shapes without getter invocation or retries, mutable adapter result isolation, receiver preservation, and HTTPS/loopback policy.

**Boundary:** The source proves nonce-store terminal consumption only. It does not establish HTTP behavior or atomicity among proof verification, nonce consumption, session creation, and response delivery. The ST188 accepted-tree and exact-head CI merge gate recorded in the platform plan still applies.

**Source SHA-256**

- `browser-nonce.ts`: `2599c6dba76d59026d94d6bbe31fe4a97a28c197be7653b25beb49e392953daa`
- `browser-nonce-session.spec.ts`: `5293b7d17b724b90eb6835b7621cf8232f804134af1188b4d45fe4db191ef628`

Tool calls used: 4 total (two source/read calls, one artifact/hash write, one handoff). No Git or metadata operations.
