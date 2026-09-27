# @subtrack/contracts

The OpenAPI document in `openapi.yaml` is the source of truth for the API
contract. Production currently declares only the approved operational routes
(`GET /healthz`, `GET /readyz`, and `GET /v1/version`). Their response payloads
and runtime semantics are intentionally unspecified; no product schemas are
inferred.

## Runtime and commands

Use Node.js **22.18.0 or newer** for this package's generation and validation
toolchain. Install workspace dependencies from the `SubTrack/` root with
`pnpm install --frozen-lockfile`. Then run:

```sh
pnpm --filter @subtrack/contracts generate
pnpm --filter @subtrack/contracts generate:fixture
pnpm --filter @subtrack/contracts typecheck
pnpm --filter @subtrack/contracts test
pnpm --filter @subtrack/contracts contract:validate
```

The pinned `@hey-api/openapi-ts` config generates a local fetch client and SDK
from production `openapi.yaml`; the schema-free Ops foundation correctly emits
no production Zod schemas. The package-local synthetic fixture under `fixtures/`
exercises Zod 4 generation without adding schemas to the production contract. Its
generated module is imported by `fixtures/zod-import.ts` and checked by
`typecheck`. Generated artifacts are committed; rerun each generation command
twice and ensure the second run leaves no diff.

Validation runs Redocly's OpenAPI spec rules and exits nonzero with diagnostics
for invalid input.
