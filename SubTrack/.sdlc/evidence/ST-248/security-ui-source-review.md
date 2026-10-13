# ST248 independent native bank privacy source review

Verdict: GO for corrected UI source. No implementation edits, Git actions, or heavy test reruns performed.

Initial finding (now resolved): NativePersonalBankScreen.tsx line30 absorbed aborted obsolete failures inside NativeSession.run for both reads and mutations. The approved exception applies to obsolete readonly traversal; a dispatched connect/sync/disconnect/purge aborted on blur can have an unknown commit. Returning null suppresses unchanged Core retirement and retains usable authority. The original mounted test asserted this retention. Restrict absorption to readonly calls without intent; mutation failures must reach Core retirement, while generation/feedback ownership suppresses obsolete UI text and prevents retry. A focused blur-during-mutation regression must require fresh verification/readback and no retry. Logout already retires through Core and should remain generation-owned.

Resolved in final delta: catch absorption now explicitly requires !intent. Sent mutation uncertainty reaches unchanged Core retirement even after blur. The revised mounted regression holds the mutation, aborts on blur, refocuses, rejects the uncertain response, requires fresh verification with private state/obsolete feedback hidden, then verifies durable retained state after fresh login and exactly one mutation. Root reports focused13 mounted tests PASS; independently inspected source/regression without rerun. Original readonly blur exception remains intact.

Remaining inspected source has no findings. API uses strict current Bearer/private HTTPS/no-store closed contracts and secure UUID keys, validates mutation operation/connection/disposition then rereads current persisted state rather than rendering historical immutable receipts. Retained revoked generations remain reachable with explicit purge confirmation. Purged feedback requires successful purge receipt and a current read excluding that connection. Genuine current failures clear content and require verification; rendering and confirmation are active-phase gated, preventing external retirement leakage. Owner rows are memory-only, generic errors expose no bank payload, and focus/logout generations suppress old-owner publication. No provider/persona selectors or bank execution are introduced.

Author reports API26/full metrics100, mounted/personal37, types/lint/parity passing; source review does not establish installed acceptance. Authenticated two-owner PostgreSQL qualifier correction and actual native gates remain separate.

Reviewed SHA-256:

- privateMobileBank.ts: a0008dc2dd092d2d9b95bae0a5dbacf3bffbcecd02f69669ab3d50ede4137128
- NativePersonalBankScreen.tsx: 083b1c2eeca17282b3fb535b5a0e976cc25dc42cdddbd1a82dbce1c4099b8bce
- NativePersonalBankScreen.test.tsx: c3ff332b9ed090b314377c57375e199a7eac5237be9bed5e7e7cf32bb76a0739

## Installed qualification addendum plan

PLAN GO for the proposed additive journey. Preserve all twelve parent screenshots, archived manual revision6 receipt and existing Add/renewal/Month/tracking/auth/restart assertions. Bank changes occur only through real installed UI, beginning with fresh verification and zero-bank baseline; no driver mutation/preseed. Existing fenced readonly bank receipt stays private and must pass a closed validator before counts/digest comparisons; manual tracking receipt must remain exact after each bank phase and API restart.

Connect, repeated Sync/dedup, API+app restart/fresh read, retained disconnect/restart, purge warning/cancel with unchanged receipt, explicit purge and final API+app restart/empty read are appropriate. UI asserts real persisted status/count/last-sync and private-hide/logout; counts/digest alone are not status evidence. Conflict, uncertainty or mismatch fails qualification without automatic retry. Only exact accepted-bank-active.png, accepted-bank-retained.png and accepted-bank-purged.png are added, copied after all assertions; raw/failed artifacts remain private and cleaned. Public bank additions are fixed booleans and bounded counts only, no bank IDs/descriptors/rows/digests/credentials.

Existing task roster covers the named driver/env/helper/tests/flows/workflow paths. Final source review and helper failure/shape/allowlist/manual-preservation tests precede execution. Actual native evidence, backend authenticated two-owner PG qualifier and parent acceptance remain separate gates. No source/Git/heavy tests performed for this plan review.
