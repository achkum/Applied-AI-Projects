# ST-236 frozen C3 QA source review — READY FOR ACTUAL PG16
Exact PR281 HEAD `cc6613cdfba54a007219cd0d7c7bcf02e1e8ed1c`; independent source review only. C2 actual run `38132016091` remains FAILED/HOLD at durable enrollment with first observed command unknown.
The C3 source delta is confined to the foundation proof and shell negative harness; SQL010, service, integration driver, pins, custody, and time bounds are unchanged.
Writer ACL now positively asserts the accepted `subtrack_runtime` identity DELETE grant from parent migration 0002 while retaining login/producer identity and session denials and provisioner UPDATE/DELETE denials.
SQL010 failure parsing accepts strict `ERROR:  42P01` at line end or before whitespace/colon; malformed, extended, lowercase, and embedded codes remain `unavailable`. Raw client text stays in private files.
The real finish writer constrains enrollment step and failure kind to fixed enums, SQLSTATE to five uppercase alphanumerics or `unavailable`, and driver exit to decimal 1–255 or `unavailable`; no raw Node/Docker output enters the receipt.
The shell negative harness calls the production parser and finish writer for colon/no-colon/end-of-line, malformed/embedded/private-sentinel, SQL010, driver-exit and invalid enrollment-field cases, including receipt sentinel exclusion.
Driver create/start/wait/exit/result and custody checkpoints retain bounded cleanup; the bundle log is private. Source pins and exact PASS marker remain required.
The unchanged integration retains real full-service OTP→proof→pending→trusted simulator→atomic account/profile/session/CSRF and signed V2 current-web owner callback, plus race, rollback, fresh-process, RLS/ACL, old-UUID and cleanup cases.
Independent `bash -n` on both changed scripts and `git diff --check 7118c1f..HEAD` passed. Full shell negatives require Linux custody semantics and were not run here.
**QA source verdict: READY FOR ACTUAL PG16.** No C3 actual-run, CI, enrolled-account, HTTP signup, or product acceptance claim; preserve C1/C2 failure history and require exact-head 34-pin enrollment PASS plus cleanup before releasing QA HOLD.
