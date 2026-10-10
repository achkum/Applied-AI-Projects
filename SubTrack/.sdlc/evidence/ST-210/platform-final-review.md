# ST-210 independent final platform source review

```yaml
contract: REVIEW/v1
task_id: ST-210
reviewer: architect-platform
verdict: APPROVE
scope: Four final adapter/module/test files; read-only source review, no jobs run.
findings: []
```

The standalone module registers live routes only with development and explicit opt-in; disabled and production registrations return generic no-store 404, and the default graph has no route. Strict raw-body/header checks require direct TLS and reject browser authority, duplicate/framing ambiguity and mixed transport. The copied, separated key frames anonymous start/verify bindings without asserting a principal.

Start reserves idempotency and bounded publication capacity before producer issuance, settles before atomic metadata/code publication, and suppresses disclosure on faults. Verify resolves internal immutable metadata, claims before producer consumption, restores only explicit decreasing wrong attempts, and retires consumed, terminal or ambiguous outcomes before any proof disclosure. Monotonic/expiry checks and restricted enrollment proof preserve ADR-0020's process-local boundary; BankID remains mandatory.

LF-normalized SHA-256 (adapter, module, unit spec, HTTPS spec): `F35F43BBB1511362BA09AA115781CCD3D90ADA5E7F66858EB55A8A270C1490F2`; `78C3200BE935114BFC530DAAA55DF64ACEA86306673975493567A4A42725F162`; `3FADAAC809F9900E965C6328D62C91B4D030C2341F6B3B26CCA13D9388711824`; `0C2C68F060B2D24F32AFDED0C1F95CC9B8F10128D1B5E856674EEC568753ED43`.

Independent QA reports 21 focused TLS/unit tests, API lint/typecheck and prior full API 1,227/web 138 PASS; adapter/module line coverage 95.18%/83.33%. Security final review approves the same hashes. This source approval does not replace exact-head CI, native/device, delivery, combined graph, durable storage or release review.
