# Token Optimizer — Local LLM Token-Reduction Engine

A single application that reduces LLM token usage — lossless-first, with opt-in prompt compression.
One optimization engine, delivered as **three pillars**: an importable **Python library** (developers
wrap their LLM/agent calls), a **browser extension** (end users optimize prompts and attachments in
any chat UI), and an **MCP server** (agents call the engine as tools). A transparent proxy and a
hosted demo are also included as optional extras built on the same engine.

This is a portfolio piece. Every individual technique here is a commodity; the product — and the
story — is integrating them into one installable thing people actually use. See `README.md` for the
full architecture, module map, and usage.

## Three principles (everything follows from these)

1. **Compress without loss (lossless-first).** Every transformation declares a guarantee
   (value-identical / text-lossless / render-equivalent / ast-identical) and honors it. A
   transform that can't prove its guarantee reverts to a no-op. Code fences are never touched.
2. **Never spend a generative LLM call to save LLM tokens.** Prompt compression uses one shared
   LLMLingua-2 model (a small ONNX token-classifier, not an LLM) hosted on Cloud Run — the same
   service for the library, extension, and MCP. It is opt-in; when the service isn't configured or
   is unreachable, compression is a no-op and the rest of the optimization still runs (there is no
   local fallback). No telemetry; the only outbound traffic is the proxy forwarding to your provider
   and the compression service.
3. **Integration over instrumentation (one app, one counter).** The product carries exactly one
   metric: a live tokens-saved counter. No dashboards, no telemetry.

## The engine: four features

| Feature | Mode | Guarantee | What it does |
|---|---|---|---|
| **Attachment normalization** | always on | lossless | Per-file-type cleanup (minify JSON/YAML, compact CSV→TSV, de-hyphenate PDF text, AST-safe code trim), cross-file dedup, delta-encoding of resent files. |
| **Cache optimization** | always on | lossless | Reorders payloads for prefix stability, hoists volatile content out of the stable prefix, injects `cache_control` markers. |
| **Prompt compression** | opt-in | lossy (controlled) | Shared LLMLingua-2 ONNX model on Cloud Run, called by every pillar. Never a generative LLM call; a no-op when the service is unavailable. |
| **Response budgeting** | always on | output-side | Injects `max_tokens` caps, optional brevity directives, compact-schema advice; measures realized output savings from usage data. |

## The three pillars (one shared engine)

```
   developers   →  PILLAR 1: Python library      import app as ts; ts.optimize(...) / ts.wrap(client)
   chat users   →  PILLAR 2: browser extension    Optimize button + attachment compression, any site
   agents       →  PILLAR 3: MCP server (stdio)   engine exposed as tools

   optional extras (same engine): transparent proxy (token-optimizer start) · hosted demo (token-optimizer web)
```

The shared entry point is `optimizer.optimize_payload()` — the library, proxy, MCP, and demo all
call it, so improvements land everywhere at once.

## Stack

| Layer | Choice |
|---|---|
| Engine + proxy + MCP + CLI | Python 3.11+, managed with `uv`, build backend hatchling |
| Proxy | FastAPI + Uvicorn, `httpx.AsyncClient` upstream |
| Providers | `providers/` adapter registry: OpenAI, Anthropic, Google, Mistral, Cohere, DeepSeek, xAI, + generic OpenAI-compatible (Groq/Together/OpenRouter/Ollama/vLLM/local) |
| Token counting | per-provider tokenizers: tiktoken (OpenAI) & mistral-common (Mistral) exact; HF `tokenizers` for local; honest `o200k×factor` proxy estimates elsewhere (`exact=False`) |
| Extraction | Microsoft `markitdown` (wrapped, never reimplemented) |
| Prompt compression | LLMLingua-2 int8 ONNX served on Cloud Run, `onnxruntime` (`serve` extra), model loaded from GCS at startup |
| MCP | official `mcp` Python SDK, stdio transport |
| Extension | TypeScript, Manifest V3, esbuild → dist, vitest; `gpt-tokenizer`; calls the Cloud Run compression service |
| Lint / test | `ruff`, `pytest` (+ `pytest-asyncio`); `npm test` (vitest) for the extension |

## Repo structure

This project lives in the `Applied-AI-Projects` monorepo as `TokenOptimizer/`. The Python half
lives in `backend/` (mirroring the sibling `BreastCancerDetection/backend/`); the installable
package is `app` (`backend/app/`, imported as `import app`). The package is grouped into three
layers — **engine core → feature modules → pillars** — with the orchestrator at the root.

```
TokenOptimizer/
├── backend/                        # the Python half (mirrors BreastCancerDetection/backend/)
│   ├── pyproject.toml
│   ├── Dockerfile                  # Cloud Run image for the compression service
│   ├── app/                        # the installable package (import app)
│   │   ├── optimizer.py            # ENGINE ORCHESTRATOR — optimize_payload(), the shared entry point
│   │   ├── core/                   # LAYER 1 — primitives every feature uses
│   │   │   ├── types.py            #   shared dataclasses/protocols
│   │   │   ├── tokens.py           #   token counting (delegates to providers)
│   │   │   ├── ledger.py           #   savings counter
│   │   │   └── providers/          #   per-provider adapters (tokenizer, routing, cache, usage, max-output)
│   │   ├── normalize/              # LAYER 2 — feature: extract, structured, textclean, code, dedup, delta
│   │   ├── cache/                  # LAYER 2 — feature: cache_optimizer (prefix-cache restructuring)
│   │   ├── compress/               # LAYER 2 — feature: llmlingua (model inference), service (client to Cloud Run)
│   │   ├── budget/                 # LAYER 2 — feature: response_budget (output-side controls)
│   │   └── pillars/                # LAYER 3 — product surfaces that consume the engine
│   │       ├── lib.py              #   PILLAR 1: importable Python library
│   │       ├── mcp_server.py       #   PILLAR 3: MCP server (stdio)
│   │       ├── cli.py              #   entry points: start / web / mcp / stats / download-model
│   │       ├── proxy/              #   extra: transparent key-forwarding proxy
│   │       └── webapp.py           #   extra: Cloud Run compression service + demo
│   └── tests/
├── shared/                         # cross-language token-count parity fixtures (Python ↔ extension)
│   └── token_test_vectors.json
├── extension/                      # TypeScript MV3 extension (PILLAR 2)
└── scripts/                        # benchmark.py, quantize_model.py, fixtures/
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

### Hosted compression service + demo (Cloud Run) — secret-free
- `token-optimizer web` (`webapp.py`): **`POST /v1/compress`** is the shared compression endpoint
  that the library, extension, and MCP all call; it runs the LLMLingua-2 model when one is loaded,
  otherwise it returns the text unchanged (no local fallback). Also serves `POST /api/compress|count|optimize`,
  `GET /` paste-and-see demo, `GET /stats`, `GET /healthz` (reports `model_loaded`). Holds **no API
  key** and never forwards — safe to host publicly. The model is loaded at startup from `TS_MODEL_DIR`
  (local) or `TS_MODEL_GCS` (GCS bucket, like the BreastCancer `.pth`). `Dockerfile` +
  `.github/workflows/token-optimizer-deploy.yml` (keyless WIF) deploy it.
- Streaming passthrough yields raw upstream bytes as received — no buffering, no re-chunking, no parsing.

### MCP tools (Plug 2)
`count_tokens`, `normalize_attachment`, `optimize_for_cache`, `compress_prompt`, `dedupe_context`
— each delegates to the same engine functions the proxy uses, and records to the shared `Ledger`.

### CLI
`token-optimizer start` (run proxy + savings page), `download-model`, `stats`, `mcp` (stdio MCP server).

## Commands

```bash
# Engine / proxy / MCP / CLI (run from TokenOptimizer/backend/)
uv sync                                   # install deps
uv run pytest                             # tests
uv run ruff check app tests               # lint
uv run token-optimizer start --port 8484      # run the proxy + savings page

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
