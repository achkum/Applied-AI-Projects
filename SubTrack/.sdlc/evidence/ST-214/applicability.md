# ST-214 evidence note

- Founder confirms SubTrack does not use Vercel; no account, integration, build, branch-protection, check-state or other-project source change is in scope.
- The supplied GitHub API audit found main protection `404 Branch not protected` and `/rules/branches/main` returned `[]`; this does not make repository-required checks optional.
- Vercel monorepo documentation (checked 2026-10-10): https://vercel.com/docs/monorepos describes deployments/statuses per connected project.
- `cutok` maps to TokenOptimizer's `cutok-frontend`; BreastCancerDetection has a separate frontend `vercel.json` and project status. Treat either status as blocking unless exact-head path/project/dependency evidence proves irrelevance.
- PR audit must identify status context and exact head SHA, changed paths, project/dependency mapping, evidence source and exclusion reason; unknown relevance blocks.
