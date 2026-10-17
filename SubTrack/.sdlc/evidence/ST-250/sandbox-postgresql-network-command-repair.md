# ST250 actual PG launcher network command repair

2026-10-14. Actual e3be79a qualification run installed frozen dependencies and compiled the API, then failed before SQL. Independent observer identified the deterministic launcher command omission: Docker network create lacked its mandatory NETWORK positional name. Root authorized only this bounded repair and actual-command shape test.

The launcher now derives `<validated mktemp basename>-network`, asserts exact st250-[A-Za-z0-9]{8}-network syntax, and supplies it as the final NETWORK argument. Captured network ID and existing unique-label cleanup remain unchanged. No DB role/grant, image/runtime/business assertion, clock, receipt flag or scenario changed. No blind unchanged run.

Light verification PASS: Bash syntax and four Node tests, including the actual source-extracted network name/guard/command invoked under a Docker shell stub that checks all six argv words and returns an ID. No Docker/SQL/network execution occurs in that test. Its temp directory is exclusively mkdtemp-created and removed. No API compilation/broad test/Git/hosted dispatch by author. Independent source review required before curation/push and one causal new-head run.

| Git-root-relative path | SHA256 |
| --- | --- |
| `SubTrack/tools/database/sandbox-qualify.sh` | `b00d12c40943c1bf75aa490856d5760f0f7bbfc8c1784a59c0841761a7252792` |
| `SubTrack/tools/database/sandbox-qualification-receipt.test.cjs` | `d5ba536ecff2ef1d0afc36bd8fea61eddcbe1879c66fab8f1c15768f0b809594` |
