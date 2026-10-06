# ST-170c4 independent platform review

**Final decision: APPROVE**

## Review provenance

An initial review approved source SHA-256 `080c33b67e2894b9e9383f733c8f9dd6beb35d7b4d3104d1d91ed76464632948` and spec SHA-256 `fc8a37429488ad9f67e63df5230281f529b917f9f4efd559f9988e02e604d78b`. After that review, security identified a losslessness gap: a custom array iterator could conceal duplicate occurrences from `for...of`. The approval above is superseded by this final review of corrected source SHA-256 `41c2035191d88bec7d4c0304e77ed7a9515357c78a378e6844e4a81d8c549089` and spec SHA-256 `a5232ffc94379e160d25ab969bfc443f78fa875693983ee3f96261ebe653c441`.

## Findings

The correction closes the reported gap. At source lines 53–65, the selector reads the array length descriptor, permits only zero or one occurrence for a selectable branch, and reads each indexed own data descriptor directly. It does not invoke the array iterator or accessor getters. The regressions at spec lines 94–114 verify that custom iterators cannot hide duplicates across access cookies, refresh cookies, and Authorization, and that accessor occurrences are rejected without invoking their getters.

The rest of the implementation remains consistent with the task and ADR-0010. The closed operation union has exactly the five protected operations plus refresh (source lines 2–8), and the result union contains only the three transport labels (lines 10–13). The module explicitly says it does not authenticate credentials (line 1). Protected requests require exactly one access cookie and no other recognized credential, or one Bearer header and no recognized cookies (lines 107–115). Refresh accepts a Refresh header alone or a refresh cookie with no Authorization and zero or one access cookie (lines 95–105), preserving the required legitimate both-cookies web refresh path while rejecting access-cookie plus Refresh-header mixing.

Malformed shapes and values normalize to a fresh generic error (lines 22–24, 37–73, 86–118). The selector neither returns credential material nor adds it to errors. Existing specs exercise unsupported operations, wrong schemes, absent credentials, duplicate values, mixed sources, malformed runtime inputs, immutability, and generic error text (spec lines 27–90).

Current saved QA artifacts report 9/9 tests passing, 95.16% statement coverage and 94.28% branch coverage (`.setup/ST170c4-tests.log`); the API TypeScript check completed without diagnostics (`.setup/ST170c4-typecheck.log`); lint emitted no diagnostics (`.setup/ST170c4-lint.log`).

No further platform changes requested.
