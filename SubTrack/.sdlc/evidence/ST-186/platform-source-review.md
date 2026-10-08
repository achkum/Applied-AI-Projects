# ST-186 Platform Source Review

**Final decision: OWNAPPROVE**

The updated owner-row preflight now checks both `createdAt` and `expiresAt` representability for each row belonging to the validated owner before trusted-time pruning. If an owned row has an unrepresentable expiry, listing returns `null` before mutating stored rows. It continues to avoid validating foreign-owner timestamps, so malformed or distant dates in another owner’s records do not affect this owner’s result.

The added tests cover both behaviors: fail-closed on an owned unrepresentable expiry without pruning an expired sibling row, and listing successfully despite a foreign owner’s out-of-range timestamp. These close the timestamp preflight gap identified after the prior approval. The earlier review findings remain: exact own-data context and canonical request ID validation; active, current-session recheck; trusted-time-only pruning; owner-only live rows; frozen copied summaries containing only the accepted fields; deterministic ordering; and relevant resolver/revocation and hostile-input coverage.

**Review limits:** This is a source review of the listed issuer implementation and listing spec against the task and plan reviews. It does not approve HTTP wiring, public contract changes, production storage, rollout, or ST-186 completion. No QA or Git state was inspected in this corrective review; the parent is rerunning QA.

**Files reviewed (SHA-256):**

- `/workspace/Applied-AI-Projects/SubTrack/apps/api/src/auth/sessions-v2/v2-session-issuer.ts`: `573a55a87734efdd068adbb20cef4cc726b63adeaaad06e7780bf144bc0f08f9`
- `/workspace/Applied-AI-Projects/SubTrack/apps/api/src/auth/sessions-v2/v2-session-listing.spec.ts`: `20105f59841ed2b854364b53c3fc1113a58f180931a8cc1cb896f25625256a13`

**Tool-call history:** 5 cumulative calls: initial required-file batch read, targeted implementation inspection, initial artifact write, corrective targeted source/test read, refreshed artifact write. No additional tools were used for this corrective review.
