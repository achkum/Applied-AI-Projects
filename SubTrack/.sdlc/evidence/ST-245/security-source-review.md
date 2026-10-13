# ST245 independent security/platform source review

Source GO approved for qualification; product acceptance remains pending.

Server review verified current bearer/active-owner authority and Just me mode before immutable owner-scoped receipt lookup, exact manual metadata CAS, unchanged protected fields, receipt insertion in the same transaction, known commit before disclosure, and the seven accepted tracking transitions. SQL001–015, existing role grants and authentication model remain unchanged. Unknown outcomes require fresh verification/readback; the native client does not automatically replay mutations.

The initial client review found first-page-only readback could hide an existing selected row and its conflict draft. Final screen SHA256 `4f110505aaa7d88d74142c08fc3385579a5518fa7c66343d1578adc13fe40399` corrects this: reread only the already loaded page count under the current session, reject duplicate rows/repeated cursors, preserve draft and block Save when authoritative review is unavailable, require explicit review, validate mutation acknowledgement ID, and use the existing legacy-category fallback. Existing generation/unmount/logout guards remain effective.

Server source pins: lifecycle `6d871043d868968c1eb357924c5359ad73ce8c0e53a375d8e717fb1452f38f13`; business `65b3552553cbdaf39ff6bb5a7a089ef18c79f3ab02a23fff651b91e8209689c4`; HTTP `ba026524849ec032c3546e70c72c5c28e5b095ba7ef1945a578ada9fc1a48260`.

Author reports 22 mounted tests plus types/lint passing for the final screen; this reviewer inspected source and did not repeat heavy checks. Real PostgreSQL fault/owner/CAS proofs and installed Android/iOS Edit/status/restart journeys still require final-head evidence. Parent ST244 acceptance and applicable CI remain blocking for merge.

Rebase onto reviewed parent source is safe if API/SQL/authentication ABI stays unchanged. Carry reviews only for byte-identical source; independently review any conflict resolution or changed implementation. An unaccepted parent is permitted for preparation, not for product acceptance or a gate waiver.
