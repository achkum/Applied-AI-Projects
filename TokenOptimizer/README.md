<div align="center">

# Token Optimizer

**Cut the token cost of LLM requests — losslessly where possible, and with a hosted compression model where not.**

Works with OpenAI, Anthropic, Google, Mistral, Cohere, DeepSeek, xAI, and any OpenAI-compatible endpoint.

**Try it live → [cutok.vercel.app](https://cutok.vercel.app)**

</div>

---

## Overview

Token Optimizer is a single optimization engine that rewrites an LLM request to use fewer tokens
before it is sent, without changing its meaning. The engine is exposed four ways:

| Interface | For | What it does |
|---|---|---|
| **Python library** | Developers | Wrap any LLM/agent call so every request is optimized before it's sent — provider- and SDK-agnostic. |
| **Browser extension** | Anyone using a web chat UI | An **Optimize** button on any editable text field. |
| **MCP server** | Agents / MCP clients | Exposes the engine as callable tools. |
| **Web app** | Anyone | Paste a prompt to compress it, or drop a file to compact it — files are processed entirely in the browser. |

A transparent proxy is also built on the same engine.

## What the engine does

| Feature | Mode | Guarantee | Summary |
|---|---|---|---|
| **Attachment normalization** | always on | lossless | Minify JSON/YAML, compact CSV→TSV, extract text from documents (PDF, DOCX, …), AST-safe code trimming, cross-file dedup, delta-encode re-sent files. See the format table below. |
| **Cache optimization** | always on | lossless | Reorder payloads for prefix stability and inject `cache_control` markers so provider prompt caches keep hitting. |
| **Prompt compression** | opt-in | lossy (controlled) | Compress prose with a hosted LLMLingua-2 model. Code blocks and quoted text are never touched. |
| **Response budgeting** | always on | output-side | Inject a provider-correct output-token cap and optional brevity directives. |

Every lossless transform declares a guarantee — `value-identical`, `text-lossless`,
`render-equivalent`, or `ast-identical` — and **reverts to a no-op if it can't prove it**, so a
request is never corrupted.

### Supported attachment formats

| Type | Formats | Available in |
|---|---|---|
| Structured | JSON, YAML, CSV, TSV | library · MCP · web app (JSON/CSV) |
| Text | TXT, Markdown | library · MCP · web app |
| Code | `.py` (AST-safe) + `.js .ts .jsx .tsx .java .c .cpp .cc .h .hpp .go .rs .cs .php .rb .sh .pl .swift .kt .scala` | library · MCP |
| Documents (text extracted) | PDF, DOCX, PPTX, XLSX, XLS, HTML | library · MCP |

The **web app** optimizes the in-browser, lossless text formats (JSON, CSV, TXT, Markdown) entirely
client-side — the file is never uploaded. Code and binary/document formats are handled by the
library/MCP via `optimize_file()` / `normalize_attachment`. (The browser extension does prompt
compression only.)

## Architecture

```
   Python library ─┐
   MCP server     ─┤                                            POST /v1/compress
   Proxy          ─┼──►  optimization engine  ──────────────►  Compression service (Cloud Run)
   Browser ext.   ─┤     normalize · cache ·                    LLMLingua-2, int8 ONNX
   Web app        ─┘     compress · budget                      loaded from object storage
```

Every interface calls one engine entry point. The lossless work runs in-process. **Prompt
compression is delegated to a single hosted service** — the same model for every interface — so
results are consistent and the model is operated and updated in one place. If the service is not
configured, compression is skipped and the rest of the optimization still runs; there is no local
fallback.

### Compression model

Prompt compression uses **LLMLingua-2** (Microsoft Research) — a BERT token-classifier that scores
each token's importance and drops the least useful ones. It is exported to ONNX and dynamically
quantized to int8 (≈709 MB → ≈178 MB) so it serves cheaply. The service runs on **Cloud Run**,
loads the model from an object-storage bucket at startup, and exposes `POST /v1/compress`. It holds
no API keys and never forwards to an LLM provider.

## Usage

### Python library

```bash
pip install token-optimizer       # or: uv add token-optimizer
```

```python
import tokenoptim as ts

# (a) functional — optimize a request, send it however you like
req = ts.optimize(model="gpt-4o", messages=[...])
resp = openai.OpenAI().chat.completions.create(**req)

# (b) universal — wrap ANY create-callable (sync or async), any provider/SDK
create = ts.optimized(anthropic.Anthropic().messages.create)
resp = create(model="claude-sonnet-4-5", system="...", messages=[...])

# (c) drop-in — wrap a known client; every call is optimized automatically
client = ts.wrap(openai.OpenAI())
client.chat.completions.create(model="gpt-4o", messages=[...])

# compact a single attachment
out = ts.optimize_file(open("data.json", "rb").read(), "data.json")

print(ts.savings())   # {'tokens_saved': ..., 'by_feature': {...}, 'calls': ...}
```

Optimization is lossless by default. To also compress prompts, point it at the compression service
and enable it:

```python
ts.configure(compress_url="https://<service>.run.app", enable_compression=True)
```

### Browser extension

Focus a substantial text box on any site and an **⇣ Optimize** button appears; click it to preview
a before/after diff and apply. The extension does **prompt compression only** — file optimization
lives in the web app.

Prompt compression calls the shared model service — a default endpoint ships with the extension, so
it works on install; override it in the options page (opened from the toolbar icon). To avoid
mangling prompts that have nothing to spare, compression is **skipped for short prompts (under ~50
tokens)** and otherwise keeps ~80% of words, removing clear filler rather than content.

```bash
cd extension
npm install && npm run build      # load extension/dist/ unpacked, or `npm run package` to zip
```

### MCP server

```bash
uv run token-optimizer mcp        # stdio
```

```json
{ "mcpServers": { "token-optimizer": { "command": "uv", "args": ["run", "token-optimizer", "mcp"] } } }
```

Tools: `count_tokens`, `normalize_attachment`, `optimize_for_cache`, `compress_prompt`, `dedupe_context`.

### Web app

Live at **[cutok.vercel.app](https://cutok.vercel.app)**. A Next.js app (`frontend/`, deployed on
Vercel) with two tools: paste a prompt to compress it via the hosted model (with a before/after
diff), or drop a file to compact it. **Files are optimized entirely in the browser — nothing is
uploaded.**

Because file processing is 100% client-side (for privacy), the web app handles only the formats
JavaScript can transform losslessly on its own: **JSON, CSV, TXT, Markdown**. PDF/Word/Excel
(binary text extraction) and code (AST-safe trimming) rely on Python-only tooling and are handled
by the library/MCP via `optimize_file()` — not the browser.

```bash
cd frontend
npm install && npm run dev        # http://localhost:3000
```

It calls the hosted compression service by default; override with `NEXT_PUBLIC_COMPRESS_URL`.

## Supported providers

| Provider | Models | Token counting |
|---|---|---|
| OpenAI | `gpt-*`, `o*` | Exact (`tiktoken`) |
| Mistral | `mistral-*`, `mixtral`, `codestral`, … | Exact (`mistral-common`) |
| Anthropic · Google · Cohere · DeepSeek · xAI | `claude-*`, `gemini-*`, `command-*`, `deepseek-*`, `grok-*` | Estimate |
| OpenAI-compatible | Groq, Together, OpenRouter, Ollama, vLLM, LM Studio, … | Exact with a local tokenizer, else estimate |

Estimates use a real byte-pair tokenizer with a per-provider correction and are always flagged
non-exact — never presented as exact. Cache savings are measured from each response's real `usage`
field, not estimated.

## Tech stack

| Layer | Choice |
|---|---|
| Engine · proxy · compression service · CLI | Python 3.11+, FastAPI, managed with `uv` |
| Compression model | LLMLingua-2 → ONNX → int8, served with ONNX Runtime on Cloud Run |
| Extension | TypeScript, Manifest V3, esbuild |
| Web app | Next.js 14, Tailwind, deployed on Vercel |
| Token counting | `tiktoken` (OpenAI) & `mistral-common` (Mistral) exact; byte-pair proxy estimates elsewhere |
| Extraction | Microsoft `markitdown` |

## Project layout

```
backend/        Python engine + library + MCP + proxy + compression service (package: tokenoptim)
extension/      Browser extension (TypeScript, Manifest V3)
frontend/       Web app (Next.js, deployed on Vercel)
scripts/        Offline benchmark over sample fixtures
```

## Development

```bash
# Python (from backend/)
cd backend && uv sync --all-extras && uv run pytest && uv run ruff check tokenoptim tests

# Extension (from extension/)
cd extension && npm install && npm test && npm run typecheck && npm run build
```
