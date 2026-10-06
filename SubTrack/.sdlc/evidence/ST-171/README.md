# ST171 exact bigint currency formatting

Additive public formatMinorUnits(bigint) preserves exact quotient/remainder, grouping, localized fractional digits, sign and currency placement for sv-SE/en-SE. Symbol/code/narrowSymbol supported; name excluded pending plural proof. Legacy formatter/tests and all clients remain unchanged.

Author checked25formatter cases with100% statement/branch/function/line coverage, money lint/typecheck exit0. Root independently compared312 cases to native exact decimal-string Intl formatting:2locales,4currency exponents JPY/SEK/KWD/CLF,3displays,13positive/negative/zero/large amounts. Native string precision sentinel passed. Full money package110cases/5suites passes. Both independent reviews approve source hashes in manifest. Node evidence does not establish Expo/Hermes/native locale support. Migration and runtime portability remain separate work.

Previous PR172 receipt reconciles credential selector DONE. No API/provider/schema/dependency changes. Exact-head CI required before merge. Author checks beforehandoff replace previous no-check restriction; no claim about measured token savings.
