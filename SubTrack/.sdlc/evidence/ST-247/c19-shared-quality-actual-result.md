# C19 changed-head shared quality actual result

Exact headccf1c0a82ecfcf5691232e922790699a29f453bf; shared SubTrack CI run38489798346/job115612041136 completed FAILURE at Gitleaks secret scan. Compose runtime job SUCCESS. Native run38489798287 remained IN_PROGRESS at initial inspection; do not infer native acceptance from unrelated passing proofs.

Safe scanner metadata only: rule generic-api-key; source files .sdlc/evidence/ST-247/legacy-token-baseline.json and legacy-token-checkout-baseline.json. No raw finding, full hash/value, line excerpt, credential or private log exposed. Direct source inspection confirms both JSON documents map only the public generated theme.native.json and tokens.css paths to64lowercase-hex hashes. These are explicit unchanged-source baselines, not runtime credentials.

Source-backed repair recommendation: retain exact baselines and their canonical/checkout assertions while representing each as explicit path plus sha256 fields instead of token-named path keys immediately bound to opaque hashes. Update only the exact baseline consumers within task roster. Do not disable Gitleaks, add a broad allowlist, change hash values or remove unchanged-source proof. This monitor made no source changes or reruns. Full private scanner log retained under host TEMP only.
