# Legacy SubTrack prototype archive

This directory preserves the standalone prototype and its historical planning material for reference. It is not the active application or a supported runtime. Its former GitHub Actions file is retained under `.github/workflows/ci.yml` as archived source only; GitHub Actions discovers workflows only from the repository-root `.github/workflows/`, so this nested copy was not an active workflow.

## Salvageable design

- **Hash-chained audit design:** `src/domain/audit.ts` links each canonical event to the prior hash so later edits are detectable. Keep the append-oriented, replaceable-store approach; do not place credentials, raw provider payloads, transaction descriptions, or identifiers in audit metadata.
- **Consent versioning:** `src/domain/consent.ts` models explicit grants and revocations as versioned history. Preserve the append-oriented history and make revocation explicit rather than overwriting prior consent.
- **MockBankProvider shape:** `src/providers/mock-bank-provider.ts` demonstrates the provider boundary. Preserve a deterministic mock implementing the same contract as real adapters, with fixed scenarios (success, empty account, pagination, duplicates, pending-to-booked, variable subscription, revoked consent, rate limit, and transient outage).

These notes capture useful concepts, not an endorsement of the legacy implementation. Current product and architecture sources of truth live in `../docs/`.
