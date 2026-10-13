# ST-245 independent platform source review

Verdict: **APPROVE SOURCE** for the ST-245 backend and contract slice reviewed on 2026-10-13 against frozen ST-244 base `ba42f072207100460c8d7b9716aa313703c32c6e`. No blocker or major platform finding in the reviewed source. This is not PostgreSQL execution, installed native acceptance, parent ST-244 acceptance, or merge approval.

SHA-256 source identity:

| File | SHA-256 |
| --- | --- |
| `apps/api/src/subscriptions/private-mobile-lifecycle.ts` | `6D871043D868968C1EB357924C5359AD73CE8C0E53A375D8E717FB1452F38F13` |
| `apps/api/src/profile/private-mobile-business.ts` | `65B3552553CBDAF39FF6BB5A7A089EF18C79F3AB02A23FFF651B91E8209689C4` |
| `apps/api/src/auth/mobile-private/private-mobile-http.ts` | `BA026524849EC032C3546E70C72C5C28E5B095BA7EF1945A578ADA9FC1A48260` |
| `packages/contracts/private-mobile.ts` | `EC1F462EF4C66D5A7F4D29DDAA8C6DB02147A61FA07B7082A9388A1F0FF938B8` |
| `packages/contracts/openapi.yaml` | `522B1819619ADA4968397323642EB3CEACB67D79B69F12A834A8FA26FDE514AA` |
| `apps/api/test/private-mobile-proof.ts` | `F5FAAE1EF1170CDD61676A5624E3690D1B4C1092A5013D79DDEC7A3D11ADDCE4` |

I read AGENTS, the Constitution, ST-245 and its source checkpoint, the relevant API contract, data-model and subscription-detail rules, the new source and tests, the existing manual-edit statement map, lifecycle decision core and durable mobile authority. I inspected the delta from the frozen base and current composition references. I did not edit feature or test source, run tests or Git operations, or access a database or network.

The two added paths stay in the closed direct-TLS private mobile roster and require current Bearer authority. Manual Edit requires a UUIDv4 intent key; status forbids a key and offers no replay guarantee. Closed payload parsers admit only the resource ID and existing manual mutable fields or status target, with no owner, person, household, currency, provider or protected-field selector. Existing cookie, browser nonce, Origin, CSRF and forwarded-authority rejection remains in the wire gate. The default and V1/web graphs are unchanged.

Both operations run inside `withCurrentMobileAuthority`, retaining current session and identity locks, both owner GUCs, named SQL only, recheck before commit, and result disclosure only after known commit. Manual Edit reuses SQL014 owner-scoped receipt read, locked MANUAL/SEK target, revision CAS update, and immutable receipt insert in that transaction. The request digest includes ID, expected revision and all editable values; exact replay returns the original committed ID/revision, changed intent conflicts, and stale revision conflicts without a write. Status locks an owner MANUAL/SEK row and applies only the seven accepted active/paused/cancelled/archive transitions from the existing decision core. Archive remains tracking state. The two new status statements are owner-qualified and parameterized; no SQL migration, role grant or authority change appears in this diff.

The PostgreSQL proof source asserts before/after-COMMIT uncertainty, restart readback, receipt replay/CAS, identical cross-owner and missing responses, status transitions, forced RLS, and prior session checks. Execution of that proof is pending and remains a blocking acceptance gate. The author checkpoint reports contracts 39/39 and business/lifecycle policy 135/135 branches, plus targeted typecheck/lint and API/client checks; these are recorded author results, not reviewer reruns. ST-244 parent acceptance, actual owned PostgreSQL execution, installed Android/iOS flow and final-head QA/CI are still required before ST-245 completion.
