# Token Optimizer — backend (Python engine)

The Python half of [Token Optimizer](../README.md): the optimization engine and the three pillars
that expose it (importable library, MCP server, CLI), plus the Cloud Run compression service.

The installable package is `tokenoptim/`, organized in three layers:

```
tokenoptim/
├── optimizer.py     # engine orchestrator (the shared entry point)
├── core/            # primitives: types, tokens, ledger, providers/
├── normalize/  cache/  compress/  budget/   # the four engine features
└── pillars/         # lib (library), mcp_server, cli + extras: proxy/, webapp
```

```bash
uv sync --all-extras                 # install
uv run pytest                        # tests
uv run ruff check tokenoptim tests   # lint
uv run token-optimizer start         # proxy + savings page
uv run token-optimizer web           # compression service + demo (Cloud Run entrypoint)
```

The cross-language token-count parity fixtures live in [`../shared/`](../shared) (asserted by both
this engine and the browser extension). See the [project README](../README.md) and
[CLAUDE.md](../CLAUDE.md) for the full architecture.
