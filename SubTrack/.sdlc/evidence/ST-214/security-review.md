# ST-214 security and privacy review
Verdict: APPROVE the governance clarification for founder review; no security or privacy blocker in the document diff.
Reviewed blobs: CONSTITUTION `e920e8bdc2dc7d07afefcb5b487eb9b4d8265f64`; QUALITY_GATES `ac205a3099f5d78163555524a759fcdde097cf7e`; OPERATING_MODEL `958ea27fcd42cb512fe6946f4edbc7a1957091f1`.
The exception is limited to a named external deployment status for another project, with exact PR-head SHA and changed-path/project/dependency evidence recorded in the PR gate audit.
Unknown relevance blocks. Applicable SubTrack, shared, dependency, security and GitHub-required checks, QA, required reviews and the security veto remain blocking.
The applicability evidence identifies SubTrack as not using Vercel and records the supplied main-protection audit (404; branch rules `[]`); it does not imply that required checks are optional.
The broader generic applicability amendment takes effect only after founder approval and merge of its governance-labelled PR; it is not automatically adopted.
Existing founder decision ST-005-Vercel (2026-09-27, `.sdlc/decisions.md`) already excludes unrelated other-app Vercel statuses from SubTrack merge gates. PRs #237/#239/#240 may apply that named decision before this amendment, only after exact-head status/path/project/dependency mapping proves each status unrelated; all SubTrack/shared/security/GitHub-required checks, QA and reviews still must pass.
