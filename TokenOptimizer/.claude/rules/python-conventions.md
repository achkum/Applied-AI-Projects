# Python / Engine Conventions

Project: `token-saver` — a local optimization engine (attachment normalization, cache
optimization, prompt compression, response budgeting) exposed through a transparent
HTTP proxy, an MCP server, and consumed by a browser extension.

## Versions and tooling

- Python 3.11+. Use 3.11+ features freely: `match` statements, `Self`, PEP 604 unions (`int | None`).
- Use `uv` for dependency management. Declare dependencies in `pyproject.toml`. Do not use raw `pip` or `requirements.txt`.
- Linter: `ruff` (config in `pyproject.toml`, default rules). Run `uv run ruff check src tests` before considering work done.
- Tests: `pytest` (+ `pytest-asyncio` for the proxy). Run `uv run pytest`.
- Type hints are required on all public function signatures (return types optional only for `__init__`).

## Code style

- Type hints on all public function signatures: `def count_tokens(text: str, model: str) -> TokenCount:`.
- Prefer `@dataclass` over passing `dict` around. The shared vocabulary lives in `types.py` — import from there, do not redefine.
- All public functions get a short docstring. One-liners unless the behavior is subtle (token heuristics, delta-store semantics, cache estimation) — those get a real explanation.
- No `print()` in library code; use the stdlib `logging` module.
- Do not prefix helpers with `_`. Use plain names; module structure handles visibility.
- Determinism matters: normalizers, dedup, and compression must produce byte-identical output for identical input (no `set` iteration order, no unsalted hashing differences). `Date.now()`-style nondeterminism is forbidden in the engine.

## File organization

```
src/token_saver/
├── types.py             # shared dataclasses/protocols — the single source of vocabulary
├── tokens.py            # token counting (tiktoken for OpenAI, heuristic for Anthropic)
├── ledger.py            # thread-safe savings counter
├── normalize/           # attachment normalization (extract, structured, textclean, code, dedup, delta)
├── cache_optimizer.py   # prefix-cache restructuring
├── compress/            # local prompt compression (rule_compressor, classifier)
├── response_budget.py   # output-side controls
├── optimizer.py         # engine orchestrator — glues the features behind one call
├── proxy/               # transparent FastAPI proxy + stats page
├── mcp_server.py        # MCP endpoint
└── cli.py               # entry points
```

The orchestrator (`optimizer.py`) is the only module that knows the feature order. Individual
normalizers and compressors know nothing about each other — they take text in, return a
`NormalizeResult`/`Change` list out. Keep them independent and unit-testable in isolation.

## The lossless-first contract (the heart of the product)

Every transformation declares a `guarantee` and must honor it:

- `value-identical` — parse both sides, structures compare equal (JSON/YAML/CSV).
- `text-lossless` — extracted text complete; only layout discarded (PDF/docx).
- `render-equivalent` — renders the same (markdown collapse, non-`.py` code).
- `ast-identical` — `ast.dump(ast.parse(before)) == ast.dump(ast.parse(after))` (Python code).

Hard rules, no exceptions:
- **Never touch content inside code fences or inline backticks.** Split on fences first, process prose segments only, rejoin. This rule is duplicated across textclean, dedup, and both compressors — keep the splitting logic consistent.
- **Never spend an LLM call to save LLM tokens.** All compression is local (rule regex + ONNX classifier). No network calls from the engine except the proxy's upstream forward.
- A transformation that cannot prove its guarantee (parse failure, AST mismatch) **reverts that unit and passes the original through unchanged.** Never corrupt; degrade to a no-op.

## Async/sync boundaries

- The proxy (`proxy/server.py`) is async FastAPI; use a module-level `httpx.AsyncClient`.
- Engine functions (normalization, compression, counting) are CPU-bound and synchronous. When called from the async proxy, wrap with `asyncio.to_thread`.
- Streaming passthrough must yield raw upstream bytes as received — never buffer the whole stream, never re-chunk, never parse SSE in the proxy.

## Testing

- `pytest` for everything; `pytest-asyncio` for proxy tests.
- Each task in `token-optimizer-dev-tasks.md` lists its required test file and acceptance criteria — those criteria are the definition of done.
- Tests must not require network or the real ONNX model by default. Inject fakes (mock upstream for the proxy, fake ONNX session for the classifier). Gate any real-model test behind `@pytest.mark.slow`.
- Test naming: `test_<module>.py`, with test names like `test_<function>_<scenario>`.

## Logging and observability

- Use the stdlib `logging` module. No `print()` in library code (the CLI may print user-facing startup lines — that is fine).
- **Never log API keys, full prompts, full responses, or raw file contents.** The proxy passes keys through and never stores them; the session id is `sha256(auth_header)[:12]`, never the key itself.
- For optimization runs, log feature name, tokens before/after, and change count — never the payload body.

## Security and constraints

- No secrets in code. The proxy is a pass-through for the user's own API key; it must never persist, cache, or log it.
- Local-first: the engine does no telemetry and phones no home. The only outbound traffic is the proxy forwarding to the user's chosen upstream.
- Approximate counts are honest counts: Anthropic has no public local tokenizer, so `TokenCount.exact` is `False` for Anthropic models. Never present a heuristic as exact.
