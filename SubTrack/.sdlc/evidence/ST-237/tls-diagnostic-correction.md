# ST-237 browser diagnostic correction

At frozen head `05d6b45`, workflow run `38142384355` passed the source pins, runtime checks, certificate preparation, and server startup, then exited `FAIL ST237_BROWSER cleanup=removed` with no browser PASS marker. That receipt does not identify a TLS or NSS cause.

Browser mode now tracks fixed phases: `LAUNCH`, `TRUSTED_NAVIGATE`, `TRUSTED_POST`, `WRONG_HOST`, `UNTRUSTED_LAUNCH`, and `UNTRUSTED_NAVIGATE`. On failure it classifies the private error into a fixed TLS code, connection refusal, timeout, launch failure, or `OTHER`. Only `DIAG ST237_BROWSER phase=<enum> class=<enum>` is emitted. The shell revalidates this exact line before copying it to the sanitized receipt after a failed browser wait. It still performs owned process-group and temporary-directory cleanup before its final FAIL marker. Raw errors, stack traces, profile paths, and certificate material stay in the private directory and are removed.

Focused local checks: Bash syntax and Node syntax passed. A deliberate wrong-head invocation exited 1 with only `FAIL ST237_SOURCE cleanup=removed`. The instrumented Linux Firefox proof has not yet run; require a new exact-head CI receipt before diagnosing the browser failure or allowing full-feature source GO.
