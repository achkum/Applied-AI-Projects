# ST250 independent platform review: PR workflow activation

2026-10-14. SOURCE GO for the bounded root-authored two-workflow event/binding amendment at the hashes below. YAML2.9.1 parse with unique-key validation and structural assertions PASS. No Git, heavy test, Docker, SQL, hosted dispatch or remote operation performed.

Both workflows preserve their manual trigger and contents:read permissions, add only precise SubTrack/source/launcher/workflow pull_request path filters, and use ordinary pull_request rather than pull_request_target. No secret expression or external application/deployment command is introduced. The image checkout and SANDBOX_SOURCE_HEAD use the identical PR head SHA/manual explicit source_head expression; its launcher checks actual Git HEAD against that binding before build. PG checkout uses PR head SHA/manual github.sha, its private candidate obtains actual checked-out HEAD, and artifact name uses the same event expression. Existing actual compilation/import/SQL/runtime assertion and cleanup paths remain the same named launchers. Neither fixture acceptance nor installed-native/public-release gates are waived.

The current YAML contains one valid top-level on mapping with both triggers; no malformed replacement residue. Image immutable checkout/upload pins and disabled persisted checkout credentials remain intact. The exact compiled main existence gate and sanitized-only post-cleanup artifact paths remain intact. New workflow absence on the default branch explains why direct manual dispatch404 required this PR-trigger amendment; successful runtime results still must be observed on the actual PR head.

| Workflow | SHA256 |
| --- | --- |
| .github/workflows/subtrack-sandbox-api-build.yml | e1927d18b1d68d19120af08d74d19e6d8edbcf34885b3fbfb93244ca7dbe35f3 |
| .github/workflows/subtrack-sandbox-postgresql-qualification.yml | 537b417f1d5c37ffcc4acbce91b09985ad420ff272ef79385da1dcc5c0b610a8 |
