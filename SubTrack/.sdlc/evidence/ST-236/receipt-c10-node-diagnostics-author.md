# C10 private Node first-account diagnostics author receipt

Source: frozen C9 `462b20e`, PR 281. This lane changed only `apps/api/test/durable-development-enrollment.integration.ts` and this receipt. No Git commit or push.

The first-account block now sets one fixed substep immediately before bootstrap, each enrollment call, each terminal denial, and each residue check. The fixed Pool adapter is passed only to first-account service instances. It forwards connect, query, arguments and release to the existing actor Pool, rethrows the original query error, and records only the first thrown query in a substep. Statement labels are chosen from fixed prefixes in the private service SQL. The SQLSTATE is reported only if it matches five uppercase alphanumeric characters. Outside the first-account checkpoint, the diagnostic fields are unavailable. The existing checkpoint failure line and successful stdout lines remain in place.

The injected profile failure now signals an `onAttempt` callback at the exact profile INSERT interception. The first-account test requires that callback to have fired after the existing generic denial. This closes the proof gap where an earlier generic denial could previously satisfy the rollback case.

Focused verification, serial: integration ESLint passed; pinned Vite-resolved esbuild `0.28.2` Node CJS bundle passed; `git diff --check` passed. No actual PG16 run was performed in this author lane. The original foundation and companion gates remain blocking. Original ST-236 clock and caps remain unchanged: start 2026-10-11 09:44:30.897Z, deadline 13:44:30.897Z, attempt 1/source attempt 1, author 4700/full PR 5000 lines.
