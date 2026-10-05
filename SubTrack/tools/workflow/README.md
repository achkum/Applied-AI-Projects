# Maintenance workflow helpers

Feature development remains paused by the user. These helpers enforce existing execution limits and check browser tooling. They do not approve feature work or a release. Run from repository root; no package installation is needed for Python/Node helper tests.

## Task guard

Persist state outside tracked source. Register every dispatched task with its actual size and role; specialists stay on Luna and the Conductor on the main model under the user's routing instruction.

```sh
python SubTrack/tools/workflow/task_guard.py --state /workspace/.setup/workflow-sessions.json start ST-168 --size M --role conductor --mode maintenance --pause-file /workspace/.setup/subtrack-development-paused.json
python SubTrack/tools/workflow/task_guard.py --state /workspace/.setup/workflow-sessions.json checkpoint ST-168 --calls 4 --progress
python SubTrack/tools/workflow/task_guard.py --state /workspace/.setup/workflow-sessions.json checkpoint ST-168 --failure missing-selector
python SubTrack/tools/workflow/task_guard.py --state /workspace/.setup/workflow-sessions.json checkpoint ST-168 --heavy start
python SubTrack/tools/workflow/task_guard.py --state /workspace/.setup/workflow-sessions.json checkpoint ST-168 --heavy end
python SubTrack/tools/workflow/task_guard.py --state /workspace/.setup/workflow-sessions.json finish ST-168
```

Checkpoint before retries, review cycles and heavy jobs; count tools since the last checkpoint. `--progress` means a new passing check, artifact or narrowed diagnosis, not merely another status message. Record stable failure/rejection signatures. Exit 2 means stop and return to the Conductor. Do not delete state or rename a task to bypass a limit. A failed narrower redispatch requires a founder decision. Completion here means a session ended, not that the task passed QA or was merged. The helper controls registered sessions; it cannot intercept unregistered tools or agent sessions.

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

## Fresh specialist context

Every new specialist task uses a new Luna agent with `fork_turns: none`; do not follow up a completed agent with a different task. Before spawning, save and validate a small JSON envelope and pass those same values to the actual collaboration tool:

```json
{"contract":"DISPATCH/v1","task_id":"ST-123","model_tier":"luna","fork_turns":"none","session_id":"ST-123-context-1","task_file":"SubTrack/.sdlc/tasks/ST-123.md"}
```

Add `--dispatch-file /workspace/.setup/dispatch.json` to specialist `start`. Envelopes over 8000 characters, reused session ids and inherited-conversation forks are rejected. This validates requested policy; the Conductor must use it in the actual spawn call. These limits are characters, not measured tokens.

A registered specialist gets `CONTEXT_REFRESH_REQUIRED` (exit2) after 20 reported calls or 30 minutes even with progress. Save a nonempty <=40-line/4000-character checkpoint containing goal, constraints, current SHA, evidence, blockers and next action. Stop owned jobs/end the old agent, then:

```sh
python SubTrack/tools/workflow/task_guard.py --state /workspace/.setup/workflow-sessions.json rotate-context ST-123 --dispatch-file /workspace/.setup/fresh-dispatch.json --checkpoint-file /workspace/.setup/ST-123-checkpoint.md
```

Spawn a fresh Luna agent using the validated new session id and task/checkpoint links. Rotation retains elapsed task budget, attempt number, tool-call totals and failure/review history. A BLOCKED task needs existing Conductor loop resolution; rotation cannot unblock it. Completing a task at a context boundary does not require spawning an unnecessary replacement. Keep a compact Conductor checkpoint at accepted task/milestone boundaries; archive long history and load only current context in a new conversation. No tool can clear/compact this current Conductor conversation, and no provider token totals are available.
