# ST199 root verification

26 focused tests PASS; 1014 full API tests in 48 files PASS. API lint/typecheck/build PASS. Pure internal core, no HTTPS/wire/device/provider/production acceptance claimed.

Root changes: canonical challenge/proof roundtrip; genuine native Promise guard before assimilation; typed-key copy avoids caller byteLength getters. Corrected QA fake proof strings and global limit fixture (10 does not reach300); key copy/method capture fixture now mutates after start/construction. Added meaningful config gates/limits/getters, authority mutation, rolling identity limits across sessions, capacity noncharging, malformed proof/thenable and postawait clock-regression cases. Fixed root test literal-type narrowing. No accepted existing source changed.

Author6 normalized interactions(cap12), unitQA5(cap8), bothfirstfinalcounts included; plans platform8/security5 originalcap4 overrun retained, amendments clarified existing ProofBinding has no channel and core onlychecks trustedassertion shape/scope. Originaltimers/cumulativeguardcounters preserved; no token/quota saving or real context-clear claim.

Runtime trust boundary: only future separatelyreviewed serveradapter may assert authority after currentprincipal+registeredcontact; no exportedminter/publicroute/authentication/deletion logic. Unknowninserted proof may expire as bounded existing5min orphan; consumedchallenge neverrestored. HTTPidempotency/throttles/freshprincipal/CSRf remain separatelygated.

Independent frozen-source platform and security APPROVE. Source review normalized counts platform5 (3 underlyingtools+2finals), security4 (2 underlyingtools+2finals); missingfirstfinalaccounting requiredoneextraresponse each, no furtherreads. Source hashes unchanged, each within5cap.
