# @subtrack/contracts

The OpenAPI document in `openapi.yaml` is the source of truth for the API
contract. This foundation currently declares only the approved operational
routes (`GET /healthz`, `GET /readyz`, and `GET /v1/version`). Their response
payloads and runtime semantics are intentionally unspecified.

## Runtime and commands

Use Node.js **22.18.0 or newer** for this package's generation and validation
toolchain. Install workspace dependencies from the `SubTrack/` root with
`pnpm install --frozen-lockfile`. Then run:

```sh
pnpm --filter @subtrack/contracts generate
pnpm --filter @subtrack/contracts contract:validate
```

Generation is local and deterministic: Orval consumes only `openapi.yaml` and
writes `generated/client.ts` and `generated/schemas.ts`. Commit generated
artifacts with changes to the source contract; rerun generation and ensure it
leaves no further diff before review. Validation runs Redocly's OpenAPI spec
rules and exits nonzero with diagnostics for invalid input.
