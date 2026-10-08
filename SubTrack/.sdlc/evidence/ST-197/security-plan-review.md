Type 2a — approve with mandatory conditions before implementation merge.

This is reversible route composition within the accepted v2 development contract, not a new security model. The proposal’s single dispatcher addresses the shared DELETE path while preserving the existing web and mobile authority checks. The plan must retain these conditions:

- Hard gate: verify ST-196 is accepted on main with its required CI/evidence before implementation proceeds. The current ST-170c snapshot says ST-196 is approved/in progress, so this gate is still pending.
- Register exactly one DELETE controller. It must call `selectV2CredentialTransport('revokeV2Session', ...)` on losslessly captured raw observations, select exactly one web or mobile branch, and delegate once to that branch’s accepted service. Do not import either ST-194 or ST-196 route controller/module, add fallback/retry, or decode/select identity in the dispatcher.
- Reject mobile requests containing any Cookie header. For web, require exactly one access cookie, zero refresh cookies, and zero Authorization headers. Preserve duplicate/malformed raw header and cookie evidence through classification; reject ambiguity before delegation with no mutation and no-store responses.
- Capture configuration and ports with descriptor-safe own-property snapshots, preserving method receivers and validating origin arrays and configuration getters. Both services must use the same authoritative repository, token verifier, principal resolver, clock, and web CSRF authority/store where applicable.
- Keep this opt-in and development-only. Do not change the default app module, providers, dependencies, contracts, accepted services, or claim production/public readiness.

Class: Type 2a. Approval covers this constrained plan only; the ST-196 accepted-main gate remains a prerequisite, and implementation review must confirm the conditions above.
