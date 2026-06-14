# Token Saver — Local LLM Token-Reduction Engine

A single local application that reduces LLM token usage for any tool, agent, or chat user —
fully local, lossless-first. One optimization engine, three ways in: a transparent HTTP proxy
(set one env var, every call is optimized), an MCP server (agents call it explicitly), and a
browser extension (humans click an Optimize button on any text field).

This is a portfolio piece. Every individual technique here is a commodity; the product — and the
story — is integrating them into one installable thing people actually use. See `README.md` for the
full architecture, module map, and usage.

## Three principles (everything follows from these)

1. **Compress without loss (lossless-first).** Every transformation declares a guarantee
   (value-identical / text-lossless / render-equivalent / ast-identical) and honors it. A
   transform that can't prove its guarantee reverts to a no-op. Code fences are never touched.
2. **Never spend an LLM call to save LLM tokens (fully local).** All compression is on-device
   (rule regex + a local ONNX classifier). The only outbound traffic is the proxy forwarding to
   the user's chosen upstream.
3. **Integration over instrumentation (one app, one counter).** The product carries exactly one
   metric: a live tokens-saved counter. No dashboards, no telemetry.

## The engine: four features

| Feature | Mode | Guarantee | What it does |
|---|---|---|---|
| **Attachment normalization** | always on | lossless | Per-file-type cleanup (minify JSON/YAML, compact CSV→TSV, de-hyphenate PDF text, AST-safe code trim), cross-file dedup, delta-encoding of resent files. |
| **Cache optimization** | always on | lossless | Reorders payloads for prefix stability, hoists volatile content out of the stable prefix, injects `cache_control` markers. |
| **Prompt compression** | opt-in | lossy (controlled) | Local rule pass (filler/hedging/politeness) + LLMLingua-2 ONNX classifier. Never an LLM call. |
| **Response budgeting** | always on | output-side | Injects `max_tokens` caps, optional brevity directives, compact-schema advice; measures realized output savings from usage data. |

## The three plugs

```
   any app/agent  →  PLUG 1: transparent proxy (localhost:8484)   set ANTHROPIC_BASE_URL once
   (zero code)                                                     → every call optimized
   Claude Desktop →  PLUG 2: MCP endpoint (same process, stdio)    agents call the tools
   chat users     →  PLUG 3: browser extension (MV3)               compress button, fully local
                     one engine — improvements land everywhere
```

## Stack

| Layer | Choice |
|---|---|
| Engine + proxy + MCP + CLI | Python 3.11+, managed with `uv`, build backend hatchling |
| Proxy | FastAPI + Uvicorn, `httpx.AsyncClient` upstream |
| Providers | `providers/` adapter registry: OpenAI, Anthropic, Google, Mistral, Cohere, DeepSeek, xAI, + generic OpenAI-compatible (Groq/Together/OpenRouter/Ollama/vLLM/local) |
| Token counting | per-provider tokenizers: tiktoken (OpenAI) & mistral-common (Mistral) exact; HF `tokenizers` for local; honest `o200k×factor` proxy estimates elsewhere (`exact=False`) |
| Extraction | Microsoft `markitdown` (wrapped, never reimplemented) |
| Classifier compression | LLMLingua-2 exported to ONNX, `onnxruntime` (optional dep group) |
| MCP | official `mcp` Python SDK, stdio transport |
| Extension | TypeScript, Manifest V3, esbuild → dist, vitest; `gpt-tokenizer` + transformers.js |
| Lint / test | `ruff`, `pytest` (+ `pytest-asyncio`); `npm test` (vitest) for the extension |

## Repo structure

This project lives in the `Applied-AI-Projects` monorepo as `TokenOptimizer/`. The Python
package is named `token-saver` (`src/token_saver/`).

```
TokenOptimizer/
├── pyproject.toml
├── shared/
│   ├── compression_rules.json      # rule spec — consumed by Python AND the extension
│   └── token_test_vectors.json     # cross-language token-count parity fixtures
├── src/token_saver/
│   ├── types.py                    # shared dataclasses/protocols
│   ├── providers/                  # per-provider adapters: tokenizer, routing, cache policy,
│   │                               #   usage fields, max-output field (the engine delegates here)
│   ├── tokens.py                   # token counting (delegates to providers)
│   ├── ledger.py                   # savings counter
│   ├── normalize/                  # extract, structured, textclean, code, dedup, delta
│   ├── cache_optimizer.py          # prefix-cache restructuring (request-time markers)
│   ├── compress/                   # rule_compressor (safe/lossy tiers), classifier (heuristic + ONNX)
│   ├── response_budget.py          # output-side controls
│   ├── optimizer.py                # engine orchestrator + optimize_payload (shared by proxy & demo)
│   ├── proxy/                      # local key-forwarding proxy (Plug 1)
│   ├── webapp.py                   # secret-free hosted engine demo (Cloud Run)
│   ├── mcp_server.py               # MCP endpoint (Plug 2)
│   └── cli.py                      # entry points: start / web / mcp / stats / download-model
├── extension/                      # TypeScript MV3 extension (T21–T24)
├── scripts/benchmark.py            # offline benchmark for the README (T26)
└── tests/
```

CI workflows live at the **monorepo repo root** `.github/workflows/` (GitHub only runs them from
there), scoped to `TokenOptimizer/**`.

## Public surface

### Proxy (Plug 1) — local, key-forwarding
- Routes **by model** (then path) to each provider's upstream (`TS_<PROVIDER>_UPSTREAM` overrides):
  Anthropic `/v1/messages`, OpenAI-compatible `/v1/chat/completions`, Gemini `/v1beta/models/…`, etc.
- `GET /stats` → JSON of `ledger.totals()`. `GET /` → self-contained HTML savings page (auto-refresh).
- `GET /healthz` → `{"status":"ok"}`.
- **Cache savings are measured from each response's real `usage`** (cached input tokens × the
  provider's discount), incl. a non-invasive streaming sniffer — not estimated. Request-time
  `cache_control` **marker injection** is implemented for Anthropic; other providers rely on their
  automatic caching and are credited via measurement. (Gemini's context cache is a separate
  create-cache API, not an inline marker, so it is measured, not injected.)

### Hosted engine demo (Cloud Run) — secret-free
- `token-saver web` (`webapp.py`): `POST /api/compress|count|optimize`, `GET /` paste-and-see demo,
  `GET /stats`, `GET /healthz`. Holds **no API key** and never forwards — safe to host publicly.
  `Dockerfile` + `.github/workflows/token-saver-deploy.yml` (keyless WIF) deploy it.
- Streaming passthrough yields raw upstream bytes as received — no buffering, no re-chunking, no parsing.

### MCP tools (Plug 2)
`count_tokens`, `normalize_attachment`, `optimize_for_cache`, `compress_prompt`, `dedupe_context`
— each delegates to the same engine functions the proxy uses, and records to the shared `Ledger`.

### CLI
`token-saver start` (run proxy + savings page), `download-model`, `stats`, `mcp` (stdio MCP server).

## Commands

```bash
# Engine / proxy / MCP / CLI (run from TokenOptimizer/)
uv sync                                   # install deps
uv run pytest                             # tests
uv run ruff check src tests               # lint
uv run token-saver start --port 8484      # run the proxy + savings page

# Extension (run from TokenOptimizer/extension/)
npm install
npm run build                             # esbuild → dist/ (load-unpacked)
npm test                                  # vitest
```

## Build plan (phases map to the dev-tasks doc)

| Phase | Scope | Tasks |
|---|---|---|
| 0 | Scaffold + shared types | T01–T02 |
| 1 | Engine core: counting, ledger, all normalizers, orchestrator | T03–T12 |
| 2 | Cache optimization + response budgeting | T13–T14 |
| 3 | Transparent proxy (passthrough → streaming → engine wired in + savings page) | T15–T17 |
| 4 | MCP endpoint | T18 |
| 5 | Prompt compression (rule spec + ONNX classifier) | T19–T20 |
| 6 | Browser extension (scaffold → TS rule compressor → diff UI → classifier) | T21–T24 |
| 7 | CLI/packaging + README/benchmark | T25–T26 |

⚠️ tasks where subtle bugs hide — review line by line: **T03, T11, T13, T16, T20, T24.**

## Hard constraints

- **Local-first, no telemetry.** The engine never phones home. Only outbound traffic is the
  proxy forwarding to the user's chosen upstream.
- **Never persist, cache, or log the API key.** The proxy passes it through; session id is
  `sha256(auth_header)[:12]`.
- **Never touch content inside code fences or inline backticks** — anywhere in the pipeline.
- **Lossless-first.** A transform that can't prove its guarantee reverts to a no-op; never corrupt.
- **Deterministic output.** Identical input → byte-identical output. No `Date.now()`, no
  unordered-set iteration leaking into results.
- **Honest counts.** Anthropic has no public local tokenizer; those counts are `exact=False`.

## Agent workflow

Three subagents in `.claude/agents/`:

- **developer** — writes code against the dev-tasks spec. Invoked for any implementation task.
- **verifier** — runs tests/lint/build and checks each acceptance criterion. Read + execute.
- **reviewer** — reads the diff, flags spec creep, lossless-contract and security issues. Read-only.

For non-trivial work: developer implements → verifier checks it runs → reviewer reads the diff.

## Imports (auto-loaded by Claude Code)

@./.claude/rules/python-conventions.md
@./.claude/rules/typescript-conventions.md
@./.claude/rules/mcp-server.md
