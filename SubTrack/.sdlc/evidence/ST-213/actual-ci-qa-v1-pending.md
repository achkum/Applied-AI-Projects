# ST-213 actual GitHub CI QA v1 — PENDING

Head: `a46be12917e998aaa6c3dc0622b1ee24a185cc83` (PR #243). Read-only independent QA; no source edits.

Required exact-head results:
- Session owner RLS proof `38074290385`: PASS.
- Container image build and smoke proof `38074290386`: PASS.
- Dedicated PostgreSQL HTTP/standalone proof `38074290445`: FAIL. Sanitized receipts: standalone `PASS listener=stopped cleanup=verified`; HTTP `FAIL phase=http-integration detail=owner code=unavailable`. The failing phase is the owner/peer/share/open-book HTTP projection segment; raw assertion output was not retained or inspected.
- Standard CI `38074290387`: FAIL at lint. API integration spec has `no-unsafe-finally` errors at lines 346, 388, and 389. Typecheck and later quality gates were skipped.
- ST-004 Compose runtime proof in `38074290387`: PASS.

Sanitized receipts downloaded under this directory from the explicitly named artifact uploads. No raw logs, credentials, identifiers, URLs, or assertion diffs were copied. QA is pending/failing until the HTTP proof and standard lint gate pass on a new exact head and applicable checks are complete. Vercel deployment statuses are separately audited by the root reviewer under the merged ST-214 applicability rule.
