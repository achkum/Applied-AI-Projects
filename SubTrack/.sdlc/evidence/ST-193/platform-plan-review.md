# ST193 platform plan review

**Decision: Type 2a, approved for the scoped development-only implementation.** The four new source files and opt-in module registration proposal stay within the accepted ST192 source boundary: repository HEAD is `e6f4bbacd856e63af1dc4cf7ccc1367e057d43a7`, tree `7ba0c30f9b2a1a18f44d05b5b3dbc5ac71913eda`, matching the accepted-main receipt. That receipt records 34 successful CI steps and all 816 API tests. The accepted ST191 platform review approves the refresh lookup seam, including its consumed-credential path. No additional ST191 or ST192 acceptance gate remains for this plan.

The ST191 review limits `webContextForRefresh` output to frozen identity/session and web transport scope derived from the matched active stored credential or retained consumed history. Consumed history may support CSRF verification and delivery to rotation's reuse handling; it does not authenticate an active protected principal. Rotation rechecks credential, transport, owner, and time. Verify CSRF before reservation or rotation; invalid CSRF must leave refresh family state untouched.

Approve HMAC browser-chain framing over chain, canonical Origin, identity, and session ID with domain separation. Cleanup requires exact conditional family revocation for the verified owner/session/family/successor hash. Invalidate CSRF only when that revocation confirms this issuance was removed, preserving an advanced row/token. Never guess a successor after unknown commit state.

After refresh, mint CSRF only from the verified new JWT's current principal and currently owned row/hash. After principal-resolution await, allow no further await before publication except error cleanup. Preserve the accepted 200 body and cookie wire format exactly. Reject any body using header/byte framing (zero length, no transfer encoding, undefined parsed body); a naturally sent access cookie is not refresh authority. State no atomicity guarantee across preflight, rotation, and socket publication.

This approval covers the bounded dev-only HTTP adapter and its tests. It does not approve runtime/provider/database/contract changes or claim rollout readiness.
