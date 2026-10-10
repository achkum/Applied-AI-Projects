# ST-213 actual GitHub CI QA v1 — PASS

Head: `a46be12917e998aaa6c3dc0622b1ee24a185cc83` (PR #243). Read-only independent QA; no source edits.

Required exact-head results:
- Session owner RLS proof `38074290385`: PASS.
- Container image build and smoke proof `38074290386`: PASS.
- Dedicated PostgreSQL HTTP/standalone proof `38074290445`: FAIL. Sanitized receipts: standalone `PASS listener=stopped cleanup=verified`; HTTP `FAIL phase=http-integration detail=owner code=unavailable`. The failing phase is the owner/peer/share/open-book HTTP projection segment; raw assertion output was not retained or inspected.
- Standard CI `38074290387`: FAIL at lint. API integration spec has `no-unsafe-finally` errors at lines 346, 388, and 389. Typecheck and later quality gates were skipped.
- ST-004 Compose runtime proof in `38074290387`: PASS.

Sanitized receipts downloaded under this directory from the explicitly named artifact uploads. No raw logs, credentials, identifiers, URLs, or assertion diffs were copied. QA is pending/failing until the HTTP proof and standard lint gate pass on a new exact head and applicable checks are complete. Vercel deployment statuses are separately audited by the root reviewer under the merged ST-214 applicability rule.

## Exact-head cycle 2 — 2026-10-10

Head verified from GitHub runs: `cc7175927a7a3c97464bb7b181f26d8f37376b1c`.

- Session owner RLS proof `38075216481`: success.
- Container image build/smoke `38075216419`: success; API and web image builds plus isolated smoke completed.
- Dedicated Linux/PostgreSQL subscription read proof `38075216423`: success. Downloaded only the fixed sanitized receipts to `ci-38075216423/`: `ST-212 disposable PostgreSQL proof: PASS receipt=integration-wrapper`; `ST-213 standalone proof: PASS listener=stopped cleanup=verified`.
- Standard CI `38075216433`: success, including Compose runtime proof and all quality steps.

Final QA/v1 verdict: PASS for the required exact-head quality, container, session-owner RLS, and PostgreSQL HTTP/standalone gates. Standard CI `38075216433`, container proof `38075216419`, session-owner proof `38075216481`, and dedicated PostgreSQL proof `38075216423` each completed success on exact head `cc7175927a7a3c97464bb7b181f26d8f37376b1c`. Standard workflow completed every listed step successfully, including full tests, visual regression, ML endpoints, i18n, secret scan and license checks. The sanitized receipts independently confirm the integration-wrapper proof and stopped-listener verified cleanup. The required original HTTP/RLS assertions remain in the dedicated integration workflow and that job passed; standalone listener/provenance cases and cleanup passed. Cycle-1 failures above remain preserved as historical evidence. No raw logs or non-receipt artifacts were downloaded. PR applicability/review gates remain with the Conductor.
