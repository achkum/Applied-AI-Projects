```yaml
contract: REVIEW/v1
task_id: ST-000
reviewer: <agent id>
verdict: APPROVE | REQUEST_CHANGES | BLOCK
summary: <≤3 lines>
findings:
  - severity: blocker | major | minor | nit
    file: <path:line>
    issue: <what>
    fix: <suggested fix>
```
Review checklist (reviewer ticks mentally, lists only failures):
correctness vs AC · contract conformance · tenancy/visibility · money rules · error handling (problem+json) ·
tests meaningful (not snapshot-only) · i18n · a11y · performance · naming/structure per skill conventions · no scope creep
