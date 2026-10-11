# ST-238 proof continuation handoff

2026-10-11 16:55 UTC. Author checkpoint only; no actual PostgreSQL or browser PASS and no approval.

This continuation extended the private proof with a dedicated natural-enrollment `empty` case. It saves/rereads a complete profile, chooses Just me, observes separate mode read and exactly one owner-list read, checks the visible true empty state and absence of rows/load-more, then verifies persisted `just-me` and zero subscription rows in disposable PostgreSQL. CI runs the case in all four locale/theme variants and uploads its screenshot. A separate case is necessary because the existing profile lost-response test leaves the UI in an uncertain editor state, and the browser has no transition from an owner list back to that editor. The profile, partial-terminal and 51-row subscription cases remain in the workflow.

The two private shell browser-failure reporters now admit the `subscriptions` and `empty` case labels and their bounded phase names. They still emit only closed diagnostic labels, not browser logs. The PostgreSQL failure reporter admits planned subscription phases.

`node --check apps/web/test/private-profile-browser.mjs` passed. `bash -n` could not run in the current PowerShell host because Bash is unavailable. PostgreSQL 16, Firefox and Docker were not available/run locally. Actual CI proof remains required.

Next proof author should add ordinary/qualified peer policy behavior before/after FORCE, fixed named statement HTTP and actual-PG negatives (incomplete choice, repeat side effect, malformed/duplicate cursor and bodies, missing/foreign 404, status conflict), 50/51/100+ tied-microsecond cursor, same-key subscription restart, and committed-lost mode/status response checks. Synthetic second-owner fixtures are acceptable for denial checks but cannot be described as a second naturally enrolled owner. Keep source/executed-bundle custody and old gates. Validate the changed shell in Linux CI. The current additions are roughly 50 nongenerated lines within the shared source/full-PR caps; parent should recompute whole-branch line count.
