# ST-237 C3 narrow recovery

Three frozen CI attempts failed before a browser PASS: C1 `05d6b45` run `38142384355` reported browser failure without a phase; C2 `7d231598` run `38142615868` reported `TRUSTED_NAVIGATE/OTHER`; C3 `2392a649` run `38142826302` reported `TRUSTED_RESPONSE/HTTP_304`.
The C3 response shows a real trusted navigation reached Next but did not meet the required HTTP 200; it does not establish completion of the browser proof.
Each trusted health navigation now uses a fresh `randomUUID()` query value on the real `/sv/register` URL so subsequent requests have distinct cache keys.
The assertion still requires DOM-loaded HTTP 200 and the same-origin Nest POST with status 201 and exact TLS/authority evidence; wrong-host and clean-profile negatives remain mandatory.
No authority header rewriting, certificate bypass, global cache setting, or acceptance of HTTP 304 was added.
Local focused checks passed: web ESLint for the proof file, `node --check`, and Git Bash `bash -n`.
The Conductor may redispatch once at the new exact head, followed by fresh independent QA if it passes.
If that run fails, stop this loop and escalate under Decision Rules §5; do not claim full-feature source GO.
