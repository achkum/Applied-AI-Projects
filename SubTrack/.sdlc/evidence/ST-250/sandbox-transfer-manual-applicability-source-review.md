# ST250 manual transfer applicability independent SOURCE review

2026-10-14. **Platform/privacy SOURCE GO for the one-line amendment to .github/workflows/subtrack-container-proof.yml.** Read-only Git comparison against775d4d5 shows exactly one added ordinary-job line:

```yaml
if: ${{ !(github.event_name == 'workflow_dispatch' && inputs.sandbox_transfer == true) }}
```

Actual file SHA256: `20d72e55e9c0f8e8f50117a0f56bcaae1eac3e5a237c1d6d1f1ea4e2fc2c9973`.

All existing ordinary container-proof job steps, runners, timeouts and artifact behavior are retained. Pull requests still run that job because their event is not workflow_dispatch. Ordinary manual runs with false/default sandbox_transfer still run it. Only explicit manualtrue transfer skips the unrelated legacy API/web build/smoke job, preventing unintended paid-quota fan-out without replacing an applicable PR check. The dedicated trusted manual transfer job and its exact repository/branch/source authority, permissions, same-image PostgreSQL/export/cleanup behavior and concurrency are unchanged.

No material platform/privacy defect found. This is an applicability correction, not evidence that the legacy job passes, PR checks are green, transfer qualifies or any release/deployment completes. No tests, CI or external actions were performed; the read-only comparison/hash and this evidence write were the only operations.
