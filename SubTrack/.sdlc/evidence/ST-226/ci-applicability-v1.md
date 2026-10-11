# ST-226 CI applicability audit
- PR #256 exact head: `4536b1208d25a682a6db78f6b107b3c23dd34a3d` (`main` base); audit uses that commit, not the dirty worktree.
- `SubTrack CI` run 38095879720: **FAIL**; `SubTrack quality gates` failed its Tests step (lint/typecheck passed; remaining conditional checks skipped).
- `SubTrack owned browser subscription lifecycle launcher proof` run 38095879816: **FAIL**; `owned-browser-proof` failed; cleanup step succeeded.
- These are applicable required SubTrack gates: PR changes SubTrack API/source/tests, launcher workflow, task/evidence and board files; dependency manifests were checked for applicability, not changed. Both failures block merge; no waiver.
- Vercel – cutok: unrelated at this head. Its project is `TokenOptimizer/frontend`; exact-head `vercel.json` scopes its ignore check there and its manifest is an independent Next app.
- Vercel – breast-cancer-detector: unrelated at this head. Its project is `BreastCancerDetection/frontend`; exact-head `vercel.json` scopes its ignore check to `BreastCancerDetection/` and its manifest is an independent Next app.
- Exact-head changed paths contain no `TokenOptimizer/` or `BreastCancerDetection/` files; repository workspace manifest/dependencies are under `SubTrack/`, with no shared workspace reference to either frontend.
- Those two Vercel deployment failures may be excluded from SubTrack applicability under the changed-path/project/dependency rule; record contexts `Vercel – cutok` and `Vercel – breast-cancer-detector` as nonblocking here.
- `gh pr checks` reports `UNSTABLE`; rulesets query returned none and `main` branch-protection endpoint reports unprotected. No review decision/request was reported; these facts do not clear failed SubTrack gates.
