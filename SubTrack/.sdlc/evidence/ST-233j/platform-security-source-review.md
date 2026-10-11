ST-233j platform/security SOURCE review — frozen head 0ec04871cb19e59bd2a73a233a53f56a9c3b262d: APPROVE; 0 blocking or major findings; no security veto.
Scope: new private transaction module/spec and ADR0029 only; Type 2a awaited lifecycle, no concrete Type 1 authority delta or activation.
Constructor and issue enforce development/config/key/purpose gates; own callable port data descriptors are captured and bound before awaits, preventing later method redirection.
Both accepted H/I handles are produced before any port call; origin/epoch/manifest/purpose agree, and the same complete frozen burn witness reaches reserve, operation and conditional failure.
Only awaited knownCommitted reserve permits one operation; operation contract requires nonce INSERT plus owned completed settlement in one transaction/connection.
Only knownCommitted operation discloses closure-private secrets; knownRollback alone attempts one conditional failed settlement. Unknown, malformed, throw or reject paths fail generically without retry, replay or compensation.
Mock tests cover deferred ordering, method replacement, witness identity, config/producer faults and secret-free generic errors; root reports focused five-file 89 tests, API ESLint and typecheck passing at this source.
These port outcomes do not prove actual PostgreSQL commit, atomicity, admission or custody. Previous-cookie global cross-purpose LIVE invalidation and reviewed SQL/transport/HTTP integration remain prerequisites; keep the port unregistered.
