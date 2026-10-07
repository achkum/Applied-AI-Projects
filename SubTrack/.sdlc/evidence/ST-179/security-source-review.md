# ST-179 security/privacy source review

Decision: APPROVE for the bounded internal in-memory redemption slice. No source-level security or privacy blocker found.

Reviewed branch `st/ST-179-login-proof-redemption`, HEAD `62b7b8c638afae87b6230c629589559d7274a563`, task contract, Constitution, approved security plan, and the actual changed source/spec. Source hashes:
- `apps/api/src/auth/proofs-v2/proof-store.ts`: `047e682103646f9c68a64fd193be7581bf1dbc44df1fa823dbb97de49d4c6b78`
- `apps/api/src/auth/proofs-v2/proof-store.spec.ts`: `d597b4a6a941cd0ff1a0998e21d4157d334e36904ca0dfc2271d498ae34e2b6e`

The implementation follows the approved boundary: `consumeLogin` takes only the one-use secret and transport context, snapshots own data descriptors into a frozen null-prototype object, validates strict v2 secret syntax and a safe nonnegative clock, and fails closed for missing/throwing adapters or malformed returned identities. It hashes with the existing domain separator and does not retain the raw secret. The in-memory adapter performs matching and deletion synchronously, checks login/authenticate purpose/action, UUID identity, challenge presence, transport and exact web binding, safe timestamps, future issuance, and exact TTL before returning only the stored identity. Mismatches do not delete live records. Generic `consume` remains unchanged.

No high, moderate, or low severity source finding. Refresh review: the updated spec now directly covers stored `stepup` and `account-delete` records with the login action, mobile records with web metadata, negative issuance, missing stored challenge, and retention of corrupt live records. It also verifies malformed secrets and invalid/throwing clocks fail before atomic consumption. The prior minor test coverage gap is closed; no new finding.

Limitations: review applies only to this internal process-local development/test store. It establishes no HTTP/session integration, trusted context provenance, durable/multi-instance atomicity, or production readiness. Future durable adapters must implement atomic compare-and-delete as the interface contract states.

No QA was run or independently verified. Initial review used 6 tool calls including artifact write. This bounded refresh used 2 tool calls (one source/spec inspection and one artifact update), for 8 total. No Git mutation, source edit, test run, install, or QA command was performed by the reviewer.
