# ST-248 authenticated second-owner qualifier source review

Independent platform source verdict: **GO** for the corrected real-PG qualifier source. The qualifier has not been executed in this review.

The owned fixture derives fixed Bob through the existing development person verifier and mobile subject binding, provisions the identity under the existing provisioner/runtime roles, and obtains a genuine Bob login proof and session through the durable session core. No Bob selector is exposed on the HTTP route. The proof checks the incomplete-profile gate, completes Bob's own Just-me profile through normal HTTP, denies reciprocal foreign sync/disconnect, and compares Alice's bank and manual receipts after attempts. Bob connects, syncs, purges, reads empty, and logs out through his own Bearer. A separate random-scope principal still checks all five FORCE RLS tables.

The final closed receipt measures two identities, two completed profiles, two Just-me modes, and one manual subscription; the shell validator requires those counts and explicit two-owner/RLS booleans. The existing owned cleanup trap remains. Actual PG16 execution and cleanup receipt are required before claiming this acceptance gate.

Independent security final delta verdict: **SOURCE GO**. The prior proof gap is resolved: before Bob-to-Alice denials, both Alice's positive snapshot and Bob's empty snapshot are captured; after EACH foreign sync/retain/purge409, both owners' bank and immutable receipt digests plus manual receipt are unchanged. After Bob's own connect/sync, Alice's API read remains exactly unchanged and excludes Bob; reciprocal Alice-to-Bob denials compare both snapshots after EACH attempt. Fixed Bob helper uses manifest-bound trusted fresh person/subject verifier, normal provisioner/runtime roles and durable login-proof/session core, not a public selector or signing shortcut. Final two-owner counts and separate RLS-negative boolean are truthful assertions, not imported fixture counts.

No execution, heavy rerun or implementation edits performed for this review. Actual PostgreSQL qualification and owned cleanup remain pending.

Verified SHA-256:

- private-mobile-bank-proof.ts: e9509dfdcb7a6c88b2e5438b2ba58cbea3eecad59b56e6140e3ae8c71aaae27d
- private-mobile-owned-fixture.ts: 15ccd6444c72e40d023606437c134b9da461f4e062a62f782ec4340ba61d8053
- private-mobile-bank.integration.ts: 7294379a69337559158ae23ba7c84b4032d4908ec129b62d206603aaabad809e
