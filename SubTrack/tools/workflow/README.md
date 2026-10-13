# Maintenance workflow helpers

Feature development continues under the user's standing authorization. These helpers preserve explicit pause state, meaningful failure history and local resource coordination; they do not authorize delivery, spending or public/production release. Run from repository root; no package installation is needed for Python/Node helper tests.

## Task guard

Persist state outside tracked source. Register dispatched tasks with their actual size and role. S/M/L estimates are planning data, not elapsed-time stops. Model/context selection follows current user and applicable agent instructions; the guard accepts Luna, Sol, default or inherited routing without forcing replacement of productive agents.

The CLI locks its shared state across processes using native Windows byte-range locking or POSIX `flock`. Python tests run without a fake locking module on either platform. A busy Windows lock may time out before any state is read or changed; report the contention instead of bypassing the lock.

```sh
python SubTrack/tools/workflow/task_guard.py --state /workspace/.setup/workflow-sessions.json start ST-168 --size M --role conductor --mode maintenance --pause-file /workspace/.setup/subtrack-development-paused.json
python SubTrack/tools/workflow/task_guard.py --state /workspace/.setup/workflow-sessions.json checkpoint ST-168 --calls 4 --progress
python SubTrack/tools/workflow/task_guard.py --state /workspace/.setup/workflow-sessions.json checkpoint ST-168 --failure missing-selector
python SubTrack/tools/workflow/task_guard.py --state /workspace/.setup/workflow-sessions.json checkpoint ST-168 --heavy start
python SubTrack/tools/workflow/task_guard.py --state /workspace/.setup/workflow-sessions.json checkpoint ST-168 --heavy end
python SubTrack/tools/workflow/task_guard.py --state /workspace/.setup/workflow-sessions.json finish ST-168
```

Checkpoint before retries, review cycles and heavy jobs; count tools since the last checkpoint. `--progress` means a new passing check, artifact or narrowed diagnosis, not merely another status message. Record stable failure/rejection signatures. Three occurrences of the same failure, two of the same review rejection, 45 active minutes without progress or 25 calls without progress require a Conductor diagnosis. Exit 2 means stop and return to the Conductor. Do not delete state or rename a task to bypass these safety limits. Redispatch cannot erase a blocked task's history; elapsed size estimates and generic dispatch counts do not create founder decisions. Completion here means a session ended, not that the task passed QA or was merged. The helper controls registered sessions; it cannot intercept unregistered tools or agent sessions.

Refresh board metrics with an explicit Git ref. `origin/main` excludes unmerged work; a maintenance-branch ref includes its planning/status corrections. Parent/child counts overlap. Historical and provider measurements remain null unless actually measured; tool calls are not tokens.

```sh
python SubTrack/tools/workflow/task_guard.py --state /workspace/.setup/workflow-sessions.json metrics --repo . --ref origin/main --output /workspace/.setup/accepted-main-metrics.json
```

## Browser canary

Use the repository's pinned Playwright and an already running loopback Storybook server. The script never starts or stops somebody else's server. Semantic selectors must match one visible element; expected text is exact after layout-whitespace normalization, preserving NBSP. Unsupported/translucent colors are rejected by the shared contrast utilities rather than guessed.

```sh
CHROMIUM_EXECUTABLE=/usr/bin/chromium node SubTrack/tools/workflow/storybook-canary.cjs --base-url http://127.0.0.1:8768 --story-id ui-button--primary --selector 'role=button[name="Continue"]' --expected-text Continue
```

`CHROMIUM_EXECUTABLE` is an optional explicit system-browser override; omit it for Playwright's installed browser. `PLAYWRIGHT_MODULE` optionally points to the installed pinned package when the normal checkout path differs. No automatic browser downloads. Errors, missing/ambiguous selectors, unexpected text, non-200 navigation or font-readiness timeouts fail the canary. Font readiness does not prove a required font was loaded; product QA must check its expected faces separately.

The maintenance smoke used an existing compiled Storybook artifact only to verify the harness. It is not a current-source build or accepted baseline. The local static server redirected the browser's missing `/favicon.ico` request to the artifact's actual `/favicon.svg`; no browser error was ignored. Preserve source SHA, build command/tool versions, story-index hash and baseline hashes before reusing an artifact for product QA; rebuild after source/config/dependency changes. A canary pass must precede, and never replace, required UI tests, screenshots, accessibility/theme/locale matrices and CI.

## Verification

```sh
python -m unittest discover -s SubTrack/tools/workflow -p 'test_*.py' -v
node --test SubTrack/tools/workflow/qa-common.test.cjs
```

Use completion notifications instead of repeated short polls. One canonical task handoff should link evidence and blockers; do not copy whole logs or conversation histories into specialists. Inspect existing PRs before dispatching implementation. Delete only exact merged-head branches after live-head comparison; preserve holding and unaccepted work.

## Optional specialist handoff

Before dispatching, save and validate a task-matched JSON envelope and use matching values in the actual collaboration tool. Inherited/default routing is supported; agent reuse and context inheritance follow applicable agent instructions. Keep handoffs concise when useful, without artificial character or line caps:

```json
{"contract":"DISPATCH/v1","task_id":"ST-123","model_tier":"inherited","fork_turns":"all","session_id":"ST-123-context-1","task_file":"SubTrack/.sdlc/tasks/ST-123.md"}
```

Add `--dispatch-file /workspace/.setup/dispatch.json` to specialist `start`. Missing/task-mismatched envelopes, unsupported routing/context modes and reused session IDs are rejected. This validates the envelope; the Conductor must apply it to the actual dispatch. Unknown/missing development authorization fails closed, and an explicit user pause still blocks feature dispatch.

A productive specialist continues beyond 20 calls, 30 minutes and the task-size estimate. Handoff is optional when useful: save a nonempty checkpoint containing goal, constraints, current SHA, evidence, blockers and next action, release any owned heavy job, then:

```sh
python SubTrack/tools/workflow/task_guard.py --state /workspace/.setup/workflow-sessions.json rotate-context ST-123 --dispatch-file /workspace/.setup/fresh-dispatch.json --checkpoint-file /workspace/.setup/ST-123-checkpoint.md
```

Use the validated session ID and task/checkpoint links for the receiving specialist. Rotation retains original start time, attempt number, tool-call/no-progress totals and failure/review history. Finished-session redispatch retains these counters and excludes idle time between sessions from the active no-progress clock. A BLOCKED task needs Conductor loop resolution; rotation cannot unblock it. Keep a compact Conductor checkpoint at accepted feature/milestone boundaries. No tool can clear/compact this current Conductor conversation, and no provider token totals are available.
