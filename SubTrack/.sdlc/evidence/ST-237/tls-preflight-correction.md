# ST-237 early TLS preflight correction

Scope: conditional Type 2a feasibility scaffold only. No enrollment/profile or source GO is claimed.

The browser proof now accepts the wrong IP host only when Firefox reports `SSL_ERROR_BAD_CERT_DOMAIN`, and the clean profile only when it reports `SEC_ERROR_UNKNOWN_ISSUER`. It never exports the raw browser error. A real trusted Next page load and same-origin Nest POST run initially and after each negative, so a dead listener or a broken API cannot satisfy the negatives.

The shell keeps generated keys, certificates, browser/server logs, and all command diagnostics in its owned private temporary directory. It checks a 40-character expected CI head against Git HEAD, checks each declared critical input against its committed blob OID and current file hash, and emits SHA-256 values in fixed `INPUT` lines. The runtime line records Playwright 1.63.0, the actual `libnss3-tools` package version, and the installed Playwright Firefox binary version. Ubuntu 24.04 and Node 22 remain workflow pins; apt's actual package version is captured rather than asserted from an inferred release value.

Browser and server run in owned process groups. The exit trap sends TERM, waits at most five seconds per group, sends KILL if needed, waits at most another five seconds, removes the task-owned directory, and verifies absence. Only then can it emit `PASS ST237_EPHEMERAL_TLS_PROFILE_CUSTODY` and `PROOF PASS head=<SHA> cleanup=removed`. Failures emit a fixed phase and cleanup state. The workflow captures only this sanitized receipt, preserves the script's nonzero status, and uploads the receipt even on failure.

Focused local checks: `bash -n` and `node --check` passed. A deliberate wrong-head invocation failed with `FAIL ST237_SOURCE cleanup=removed` and exit 1. The Linux Firefox/NSS/Next/Nest proof has not run locally. Require an actual workflow PASS at the exact committed PR head and independent QA before full-feature source GO.
