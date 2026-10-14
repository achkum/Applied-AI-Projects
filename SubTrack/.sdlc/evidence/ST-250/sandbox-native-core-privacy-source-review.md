# Native sandbox Core privacy source re-review

2026-10-14. SOURCE GO for Core.ts SHA25685acd8109afb472b0101c074d7aeb5ba87da2dc1dad35423546ccc24d7d48ef3 and Core.test.ts e5b38b6f888c58265ce30d06fc9cb931602643a74af0fce4ce11a7712c530892. Root read actual full Core source independently of author; platform re-review remains separate.

Revocation-only credentials are set after the generation guard and before persistence, never read by business run/refresh. Logout captures and consumes them synchronously, retires generation, clears capability, and attempts captured server revocation even on failed secure deletion. A late response cannot restore custody. Failure latch does not depend on an intent generation; every queued authority operation checks it before storage/network. Failed deletion blocks newer queued initialize/bootstrap/resume; only an acknowledged explicit deletion resets it. Dispose cannot reset failure. Unknown network/logout does not imply acknowledged server revocation.

Author verified40 focused tests with enforced100% policy coverage, types and scoped lint. Source acceptance only; actual server persistence, native install and device behavior still required. Separate API409 contract correction is pending review; this note approves only these two Core files and does not approve complete composition.
