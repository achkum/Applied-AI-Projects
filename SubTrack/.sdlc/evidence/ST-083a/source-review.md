# ST-083a frozen source review

**APPROVE — source/runtime/math/security review only.** The frozen implementation matches the clarified contract and the recorded ADR and assumptions. This approves the standalone Type 2a helper source; it does not approve caller integration, persisted events, or overall task completion.

## Frozen source identity

All four actual SHA-256 values match `.sdlc/evidence/ST-083a/source-freeze.json`:

- `packages/money/src/price-increase.ts`: `24f60ad4fa80419fb5bf4005ef60fada53f08597d2388714f1fdc304fcfa9160`
- `packages/money/test/price-increase.spec.ts`: `19f11892b8a2a2c8eeb3b8b24218e66799b352273a22a5454f12c2298c05437b`
- `packages/money/src/price-increase.md`: `3e098f90ac078c577f4ff70b0d77cf4f4461ffac00b5d9c4c9ed57fcf6655daa`
- `packages/money/src/index.ts`: `44e99f6e425fdbe19c54cfd0af4f5163901ed0ba502f281fc6b930d22100cb03`

## Review findings

The implementation requires an actual history array with captured numeric length exactly 3, reads the three indexes once, and never consults its iterator. A per-call WeakMap snapshots each unique object identity once; primitive values and functions are rejected before property reads, and the five logical inputs can add at most five identities. Captured `minorUnits` and `currency` are each read once, then checked as nonzero `bigint` and exact `'SEK'`. All five values are validated before any false result. The outer catch maps shape, proxy, getter, and unexpected failures to the fixed `MoneyError('Price increase confirmation unavailable')`; raw error details are not returned. The code does not mutate arguments.

The median is the middle of the three positive BigInt magnitudes. Candidate and repeat must match exactly; positive delta is then checked with strict `100n * delta > 3n * median || delta > 500n`. This preserves the specified strict boundaries and OR behavior without floating point or `Number(amount)`.

The source tests include the required literal boundaries: baseline 10,000 with 10,300 false and 10,301 true; baseline 20,000 with 20,500 false and 20,501 true; 10,500 true through the percentage branch and 20,600 true through the absolute branch. They also cover median permutations, signed magnitude, large BigInt boundaries, validation before a non-repeat false, aliases/getter counts, malformed history, proxies, privacy of fixed errors, and nonmutation.

The API and documentation leave authoritative charge selection, owner/service/cadence grouping, eligibility, refund/exclusion handling, chronology, and actual next-cycle provenance to the caller. The helper itself makes no persistence, source, provider, default, UI, or automatic action claim. The documented exact-repeat, nonzero, and SEK-only choices are recorded as assumptions; foreign-currency thresholds and persisted `price_event` integration remain out of scope. I found no runtime, arithmetic, or privacy issue that blocks this frozen standalone source.

## Call accounting

Three underlying shell calls total, zero failures: (1) read-only status and SHA-256 of the nine specified governance/task/evidence paths, (2) batched reads of those specified files, (3) SHA-256 plus reads of the four frozen files and test source. The third call confirmed all four hashes match the freeze. One final write created this report at `/workspace/.setup/ST083a-source-review.md`. No tests, git mutations, network, database, install, or repository writes were performed. Total underlying tool calls: four including report write; failures: zero.
