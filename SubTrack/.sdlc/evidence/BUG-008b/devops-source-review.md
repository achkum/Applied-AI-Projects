# BUG-008b DevOps source review

```yaml
contract: REVIEW/v1
task_id: BUG-008b
reviewer: devops-release
stage: working-tree source, draft PR 237
head: f4f6acb473fd60cb0063968299e58cd04f1037ae plus uncommitted proof-script edits
verdict: REQUEST_CHANGES
findings:
  - severity: minor
    file: .github/workflows/subtrack-clean-migration-proof.yml:37
    issue: "Upload-artifact is skipped when the proof step fails, so sanitized failure receipts (including startup phase) are not retained as artifacts."
    fix: "Run artifact upload with if: always(), retaining the receipt when it exists."
```

The shell unsets inherited `DATABASE_URL`, creates only a fresh PostgreSQL 16 container with a tmpfs data directory, randomized name, random credentials, and loopback ephemeral port. Credentials and command logs stay in a mode-077 temp directory; failures emit sanitized stage/phase and SQLSTATE only. Cleanup uses the recorded container ID and verifies its BUG-008b label before removal. The run deploys the complete chain, checks both finished migration checksums and ledger count, allows only three named partial-index drops in modeled drift, and runs Prisma generate before Vitest. No reset/drop/migrate-resolve or existing database path is present. Vitest config scopes execution to the clean-migration integration file; the shell provisions one ordinary runtime LOGIN and four separate service LOGINs.

Actual PostgreSQL CI is not proven here: first run failed during startup and a new run is pending. Reviewed source only; no tests or database operations run.

Raw-file SHA-256: workflow `BBA379F3689060A122F75F90A0DDE07A878E8AE26B5A4F302D76641B430CE70A`; proof shell working tree `DBC10265FCA2364C82532A9FFFF65CB7B091439C1B390E73B7BF1A28712E9487`; Vitest config `C382B0CDC56E5D7AE69400B49567B35DD12E06E5152B33B92D7865764C74542A`.

## Exact-source re-review
`APPROVE_SOURCE` — artifact upload now runs `if: always()` and ignores an absent receipt; original finding is resolved. Policy failure receipt safely falls back to `phase=startup` or reports its whitelisted phase, though it currently omits the test marker's validated error code. No CI/PG result is claimed. LF SHA-256: workflow `dd2e4d7772508ed8c39c0155b2dfbf03461cebea018fba5c901e6f30814cab7b`; shell `cc32103bc958fd326aa5096ba4975b946d9f9a91d7a13186812a97539360e0fa`; Vitest config `a373306eeb0cbaeb44c8651a0c44362609de0f608c20d03266c4b4f3fd95e741`.
