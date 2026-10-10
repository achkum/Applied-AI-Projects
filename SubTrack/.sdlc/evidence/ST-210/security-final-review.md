# ST-210 independent final security source review

```yaml
contract: REVIEW/v1
task_id: ST-210
reviewer: security-privacy
verdict: APPROVE
scope: Four-file final source and test review; no test, network, DB or CI job run by reviewer.
findings: []
```

The prior four findings are resolved: strict raw-body scanning rejects decoded duplicate JSON names, malformed length/UTF-8 and parsed-body disagreement before mutation; the disabled and production controllers return generic no-store problem 404; the module copies the rate key; actual HTTPS assertions cover these paths and the required transition/fault cases. The default graph remains absent.

Direct `TLSSocket` and `request.secure` checks, exact header allowlist and framed, separated anonymous HMAC bindings preserve the mobile-only boundary. Start reserves idempotency and store capacity before producer mutation, settles before atomic metadata/code publication, and discloses no challenge on faults. Verify claims before producer consumption, settles before proof disclosure, restores only explicit decreasing incorrect attempts, and retires success, terminal and ambiguous outcomes. The proof remains restricted to mobile enrollment; no BankID, production, delivery or public-port bypass is introduced.

LF-normalized SHA-256 in order (adapter, module, unit spec, HTTPS spec):

`F35F43BBB1511362BA09AA115781CCD3D90ADA5E7F66858EB55A8A270C1490F2`
`78C3200BE935114BFC530DAAA55DF64ACEA86306673975493567A4A42725F162`
`3FADAAC809F9900E965C6328D62C91B4D030C2341F6B3B26CCA13D9388711824`
`0C2C68F060B2D24F32AFDED0C1F95CC9B8F10128D1B5E856674EEC568753ED43`

Author evidence reports focused actual HTTPS/unit 21 PASS, lint/typecheck PASS, changed-source coverage 95.18%/83.33%; earlier independent QA reports API 1,227 and web 138 PASS. This approval is source-only and does not replace QA or exact-head CI.

CI238 follow-up: `st210-one-global-key-0001` at the committed unit fixture line 97 is a public, fixed Idempotency-Key test input, not a credential or secret; its deterministic text has no source entropy. I approve only the exact historical Gitleaks fingerprint `f22f4f79546a920829df0f845c1a2757701012a4:SubTrack/apps/api/src/auth/otp-v2/mobile-enrollment-otp-http.spec.ts:generic-api-key:97` for an allowlist entry. No broader rule/path suppression or history rewrite is approved; the four reviewed source hashes remain unchanged.
