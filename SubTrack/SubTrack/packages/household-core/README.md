# SubTrack household core

Zero-dependency domain module for ACH-7. Money is always an integer in minor units. Percentages use integer basis points, and rounding uses a deterministic largest-remainder rule with user ID as the tie-breaker.

The module covers household creation, email-bound invitations, explicit per-subscription sharing, equal/percentage/fixed/custom allocation, deterministic net settlement, and participant-authorized completion tracking. It does not expose transactions or subscriptions merely because someone joins a household.

Run `npm test` from this directory. The persistence/API layer should store the returned records transactionally and enforce the same membership checks at the authorization boundary.
