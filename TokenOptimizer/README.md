<div align="center">

# Token Saver

**Cut your LLM token bill without changing your code.**

A local, lossless-first optimizer that sits between your app and any LLM provider — minifying
attachments, stabilizing caches, compressing prompts, and budgeting output, automatically.

`pip`/`uv` installable · works with OpenAI, Anthropic, Google, Mistral, Cohere, DeepSeek, xAI &
any OpenAI-compatible endpoint

</div>

---

## Overview

Token Saver reduces the number of tokens your applications send to and receive from large language
models. It runs entirely on your machine, never transmits your prompts or API keys to a third
party, and integrates three ways:

- **Proxy** — point your client's base URL at it; every request is optimized with zero code change.
- **MCP server** — expose the engine as tools to any MCP-aware agent (Claude Desktop, Cursor, …).
- **Browser extension** — an Optimize button on any text field, on any website.

A hosted, key-free demo of the optimization engine is also included for evaluation and deployment.

---

## Features

- **Attachment normalization** — minify JSON/YAML, compact CSV→TSV, clean PDF/Word extraction
  artifacts, AST-safe code trimming, cross-file de-duplication, and delta-encoding of re-sent files.
- **Cache optimization** — reorder payloads for prefix stability and inject provider cache markers
  so you stop busting your own prompt cache.
- **Prompt compression** — remove conversational filler and (optionally) redundant wording with a
  fully on-device pass. Code and quoted text are never altered.
- **Response budgeting** — apply the correct output-cap field per provider, optional brevity
  directives, and reasoning-budget clamps.
- **Live savings counter** — one number, measured from real provider usage data.
- **Multi-provider, multi-tokenizer** — exact token counts where a local tokenizer exists, honest
  estimates where it doesn't; never presents an estimate as exact.

All transformations are **lossless by default**: each declares a guarantee and reverts to a no-op
if it cannot be met, so a request is never corrupted or broken.

---

## Supported providers

| Provider | Models | Token counting |
|---|---|---|
| OpenAI | `gpt-*`, `o*` | Exact (`tiktoken`) |
| Mistral | `mistral-*`, `mixtral`, `codestral`, … | Exact (`mistral-common`) |
| Anthropic | `claude-*` | Estimate |
| Google | `gemini-*` | Estimate |
| Cohere · DeepSeek · xAI | `command-*`, `deepseek-*`, `grok-*` | Estimate |
| OpenAI-compatible | Groq, Together, OpenRouter, Fireworks, Perplexity, **Ollama, vLLM, LM Studio**, … | Exact with a local tokenizer, else estimate |

Estimates use a real byte-pair tokenizer with a per-provider correction and are always flagged as
non-exact.

---

## Installation

Requires Python 3.11+ and [`uv`](https://docs.astral.sh/uv/).

```bash
uv sync                 # core: engine, proxy, CLI
uv sync --all-extras    # + MCP server, extra exact tokenizers, ONNX compression model
```

---

## Quickstart

### 1. As a proxy (recommended — works with any tool)

```bash
uv run token-saver start --port 8484
```

Then point your existing client at it:

```bash
export ANTHROPIC_BASE_URL=http://localhost:8484     # Claude SDKs
export OPENAI_BASE_URL=http://localhost:8484        # OpenAI, Groq, Together, Ollama, …
```

Every call is now optimized. Open `http://localhost:8484/` for the live savings dashboard.

### 2. As an MCP server (for agents)

```bash
uv run token-saver mcp
```

Add to your MCP client config (e.g. Claude Desktop's `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "token-saver": { "command": "uv", "args": ["run", "token-saver", "mcp"] }
  }
}
```

Exposes: `count_tokens`, `normalize_attachment`, `optimize_for_cache`, `compress_prompt`,
`dedupe_context`.

### 3. As a browser extension (any website)

Works on **any site** — focus any substantial text box (ChatGPT, Claude, Gemini, your own app,
anywhere) and a floating **⇣ Optimize** button appears. Click it to preview a before/after diff and
apply. There's also a right-click **"Optimize text"** menu item. Everything runs locally; nothing
leaves the browser.

```bash
cd extension
npm install
npm run build        # load extension/dist/ unpacked for local dev
npm run package      # → token-saver-extension.zip for store submission
```

For local development: `chrome://extensions` (or `edge://extensions`) → **Developer mode** → **Load
unpacked** → `extension/dist/`.

To publish for anyone to install, see [`extension/PUBLISHING.md`](extension/PUBLISHING.md) — it
covers the **Microsoft Edge Add-ons** store (free) and the **Chrome Web Store** ($5 one-time),
using the same `token-saver-extension.zip`. Listing copy and the privacy policy are in
[`STORE_LISTING.md`](extension/STORE_LISTING.md) and [`PRIVACY.md`](extension/PRIVACY.md).

---

## Configuration

### CLI

```text
token-saver start          Run the optimizing proxy + dashboard (local, forwards your key)
  --port N                 Listen port (default 8484)
  --host HOST              Bind host (default 127.0.0.1)
  --enable-compression     Enable lossy prompt compression
  --brevity                Append a concise-output directive to prose prompts
  --max-output-tokens N    Inject a provider-correct output cap

token-saver web            Run the secret-free engine demo/API (for hosting)
token-saver mcp            Run the MCP server over stdio
token-saver stats          Print savings from a running proxy
token-saver download-model Fetch the optional ONNX compression model
```

### Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `TS_OPENAI_UPSTREAM`, `TS_ANTHROPIC_UPSTREAM`, `TS_GOOGLE_UPSTREAM`, `TS_MISTRAL_UPSTREAM`, `TS_COHERE_UPSTREAM`, `TS_DEEPSEEK_UPSTREAM`, `TS_XAI_UPSTREAM`, `TS_OPENAI_COMPATIBLE_UPSTREAM` | proxy | Override a provider's upstream base URL (e.g. point the OpenAI-compatible one at `http://localhost:11434` for Ollama). |
| `TS_LOG_DIR` | proxy | Directory for the JSON-lines savings log (default `~/.token-saver`). |
| `PORT` | web | Port for the hosted demo (Cloud Run sets this automatically). |
| `ALLOWED_ORIGINS` | web | Comma-separated CORS origins for the demo API (default `*`). |

API keys are read from your client's normal headers and **passed straight through** — Token Saver
never stores or logs them.

---

## How it works

```
client ──► proxy ──► [ engine: normalize → cache → compress → budget ] ──► provider
                          │                                                    │
                          └── records savings to the live counter ◄── measures cache from usage ──┘
```

1. **Route** — the target provider is resolved from the request's model (or path), and the request
   is forwarded to that provider's upstream.
2. **Optimize** — document attachments are normalized, the payload is cache-optimized, prose is
   optionally compressed, and an output budget is applied. Anything that can't be parsed or proven
   lossless is forwarded unchanged.
3. **Forward** — the optimized payload is sent upstream with your key intact. Streaming responses
   are passed through byte-for-byte; retries happen only before the first byte reaches the client.
4. **Measure** — cache savings are read from the response's real usage data (cached input tokens ×
   the provider's discount), not estimated.

The optimization engine is **secret-free** (it needs no API key), so it can be hosted publicly as a
demo/API. The proxy — the only component that handles your key — is designed to run locally.

---

## Accuracy & guarantees

| What | How it's reported |
|---|---|
| Attachment & prompt savings | Measured with the provider's tokenizer (exact where available). |
| Cache savings | Measured from the response's `usage` field. |
| Output savings | Not claimed — capping output is real, but the avoided amount is not measurable without a control. |
| Anthropic / Gemini / Cohere counts | Real BPE estimate, explicitly flagged non-exact. |

Lossless guarantees per transformation: `value-identical` (JSON/YAML/CSV), `text-lossless`
(PDF/Word), `render-equivalent` (Markdown), `ast-identical` (Python). Code fences and quoted spans
are never modified.

---

## Deployment

The hosted engine demo deploys to **Google Cloud Run** with no stored credentials:

```bash
docker build -t token-saver-demo .
docker run -p 8080:8080 token-saver-demo
```

A GitHub Actions workflow (`.github/workflows/token-saver-deploy.yml`) builds and deploys to Cloud
Run via keyless Workload Identity Federation; enable it by setting the repository variable
`TS_GCP_ENABLED=true` and the associated `WIF_*` / `GCP_*` variables.

---

## Benchmark

Measure the engine on the bundled sample files (offline, no API calls):

```bash
uv run python scripts/benchmark.py scripts/fixtures
```

```
File                              Before     After    Saved
------------------------------  --------  --------  -------
data.json                            136        80    41.2%
report.md                            120        82    31.7%
prompts.txt (rule compression)       108        82    24.1%
table.csv                             43        39     9.3%
module.py                             51        51     0.0%
------------------------------  --------  --------  -------
TOTAL                                458       334    27.1%
```

Savings depend heavily on your payloads — file-heavy and agentic (re-sent context) workloads see
the largest reductions.

---

## Project layout

```
src/token_saver/
├── providers/          Provider adapters: tokenizer, routing, cache policy, usage, schema
├── normalize/          Attachment normalization (extract, structured, textclean, code, dedup, delta)
├── compress/           Prompt compression (rule pass + local classifier)
├── cache_optimizer.py  Prefix-cache restructuring
├── response_budget.py  Output-side controls
├── optimizer.py        Engine orchestrator (shared by proxy and demo)
├── proxy/              Local key-forwarding proxy + dashboard
├── webapp.py           Hosted secret-free engine API/demo
├── mcp_server.py       MCP endpoint
└── cli.py              Command-line entry points
extension/              Browser extension (TypeScript, Manifest V3)
shared/                 Compression rules + tokenizer parity fixtures (Python ↔ extension)
scripts/benchmark.py    Offline benchmark
```

---

## Development

```bash
uv sync --all-extras
uv run pytest
uv run ruff check src tests scripts

cd extension && npm install && npm test && npm run typecheck && npm run build
```

Contributions welcome — add a provider by implementing a `ProviderAdapter` in
`src/token_saver/providers/`; add a compression rule in `shared/compression_rules.json` (it drives
both the Python engine and the extension).

---

## Roadmap

- Request-time cache-marker injection for Google Gemini context caching.
- A `pipx`-installable distribution.
- Team-shared proxy mode with a persistent ledger.

---

## Limitations

- Optional lossy compression trades a small amount of fidelity for size; the default profile is
  lossless.
- Token counts for providers without a public local tokenizer (Anthropic, Gemini, Cohere) are
  estimates.
- Cache-marker injection is currently implemented for Anthropic; other providers' cache savings are
  measured from usage rather than actively injected.

---

## Status

A personal portfolio project by Achyuth Kumar Baddela. Not released under an open-source license —
all rights reserved. You're welcome to read the code; please get in touch before reusing it.
