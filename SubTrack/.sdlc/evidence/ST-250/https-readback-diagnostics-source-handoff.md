# Trusted HTTPS readback bounded diagnostics

Owned source changes: tools/sandbox/deploy.sh and tools/sandbox/activation-contract.test.cjs only. All original HTTPS, body limit, no-store, status, owner isolation, container custody, restart, durable readback, refresh and logout assertions/order remain. No response/body/status values, original errors, headers, credentials, resource IDs or paths are printed. The existing generic failure remains, preceded by a fixed operation/predicate label. Unknown diagnostic values normalize to INPUT/VALUE; original exception properties are never read.

Steps: INPUT, BOOTSTRAP, PROFILE, MODE, MANUAL, OWNER_READ, DISTINCT_OWNERS, FOREIGN_STATUS, INSPECT, RESTART, RESTART_READY, RESUME, RESTART_READBACK, REFRESH, REFRESH_READBACK, LOGOUT, LOGOUT_READBACK, LOGOUT_RESUME.
Predicates: IDENTITY, FETCH, BODY_BOUND, CACHE_CONTROL, JSON, HTTP_STATUS, VALUE, CAPABILITY, OWNER_DISTINCT, CONTAINER_COUNT, IMAGE, NAMESPACE, SOURCE, SERVICE, PROCESS, READY, ITEM_COUNT, ITEM_ID, AMOUNT.

Focused actual-script test passed seven failure scenarios (fetch rejection, oversized body, wrong cache header, invalid JSON, unexpected status, missing capability, hostile thrown Proxy) with exact two-line sanitized stderr and empty stdout. Unknown label fallback tested. Bash/Node/test syntax passed. No external operation, runtime request, CI, Docker action, Git action or broad suite ran. Source does not establish the actual failing predicate from the previous generic failure, so no acceptance fix is inferred.

Standalone operator probe: extract the exact existing Node heredoc, normalize only CRLF to LF, without editing the live source ledger. Save operator-owned private UTF8-no-BOM bytes. The extracted text without trailing newline has SHA256 4a47dab74660bf8044b8ab776cac7d7be0eccb617d467e11b38e2daf043a6697. Run only after independent review and normal root-owned live custody validation, under the existing timeout90s/kill-after10s, with actual owned api_id and measured api_container_image as argv, and actual ST250_SOURCE_HEAD environment. Same live gateway startup prerequisite remains; this script does not start it.

Extraction example (local source only; no runtime executed here):
```python
from pathlib import Path
s = Path('tools/sandbox/deploy.sh').read_text()
script = s.split('node - "$api_id" "$api_container_image" <<\'NODE\'\n', 1)[1].split('\nNODE', 1)[0]
# Write to a new exact private operator path; do not overwrite existing material.
```

SHA256:
- deploy.sh: 7e31d09fe556eb4c8aec0cfa321d660d0ce0acbdabc07a4883213594a94cc87a
- activation-contract.test.cjs: 6492856426d08b061774476e815068f848b0d5b30c6bce4a7a43defd1c768d92