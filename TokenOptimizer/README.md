<div align="center">

# Token Optimizer

**Cut your LLM token bill without changing how you work.**

A local, lossless-first optimizer for LLM requests — minify attachments, stabilize caches,
compress prompts, and budget output — delivered three ways: a **browser extension**, an
**importable Python library**, and an **MCP server**.

Works with OpenAI, Anthropic, Google, Mistral, Cohere, DeepSeek, xAI & any OpenAI-compatible
endpoint. Runs on your machine.

</div>

---

## The three ways to use it

| | For whom | What it does |
|---|---|---|
| 🧩 **Browser extension** | End users in any chat UI | An **Optimize** button on any text field, and automatic **attachment compression** when you attach a file. |
| 📦 **Python library** | Developers | `import` it and wrap your existing LLM/agent calls so every request is optimized — any provider, any SDK. |
| 🔌 **MCP server** | Agents / MCP clients | Exposes the engine as tools (count, normalize, compress, cache-optimize, dedupe). |

All three share one engine. The lossless work — attachment normalization, cache optimization,
response budgeting — runs entirely on your machine. Prompt compression has two levels: **Low**
runs a local rule pass (offline, instant); **High** calls one shared LLMLingua-2 model hosted on
Cloud Run, so the library, extension, and MCP server all get the same compression from the same
service. Low is the default; High is opt-in.

---

## 1. Python library

Add a single optimization layer on top of the calls you already make. Provider-agnostic — it
transforms the request payload, so it doesn't care which SDK you use.

```bash
uv add token-optimizer        # or: pip install token-optimizer
```

```python
import token_optimizer as ts

# (a) functional — optimize a request, send it however you like
req = ts.optimize(model="gpt-4o", messages=[...])
resp = openai.OpenAI().chat.completions.create(**req)

# (b) universal — wrap ANY create-callable (sync or async), any provider/SDK
create = ts.optimized(anthropic.Anthropic().messages.create)
resp = create(model="claude-sonnet-4-5", system="...", messages=[...])

# (c) drop-in — wrap a known client; every call is optimized automatically
client = ts.wrap(openai.OpenAI())
client.chat.completions.create(model="gpt-4o", messages=[...])

# compress a single attachment
out = ts.optimize_file(open("data.json", "rb").read(), "data.json")

print(ts.savings())   # {'tokens_saved': ..., 'by_feature': {...}, 'calls': ...}
```

Lossless by default. Opt into lossy prompt compression with `ts.configure(enable_compression=True)`.
That uses the local rule pass unless you point it at the hosted model with
`ts.configure(enable_compression=True, compress_url="https://<your-service>.run.app")`, in which
case it calls the shared Cloud Run model and falls back to the rule pass if the service is
unreachable.

## 2. Browser extension

Focus any substantial text box on **any site** and an **⇣ Optimize** button appears — click to
preview a before/after diff and apply. When you **attach a file**, text formats (JSON/CSV/Markdown)
are losslessly compressed before they're sent — that always runs in the browser.

A **Low / High** toggle controls prompt compression. **Low** runs the local rule pass in the
browser (offline, instant). **High** sends the text to the shared Cloud Run model for stronger
compression and falls back to Low if the service is unavailable; set the service URL in the
extension options.

```bash
cd extension
npm install
npm run build        # load extension/dist/ unpacked for local dev
npm run package      # → token-optimizer-extension.zip for store submission
```

Local dev: `chrome://extensions` (or `edge://extensions`) → **Developer mode** → **Load unpacked**
→ `extension/dist/`. To publish for anyone to install, see
[`extension/PUBLISHING.md`](extension/PUBLISHING.md) (Microsoft Edge Add-ons is free; Chrome Web
Store is a one-time $5). Listing copy and privacy policy:
[`STORE_LISTING.md`](extension/STORE_LISTING.md), [`PRIVACY.md`](extension/PRIVACY.md).

> Attachment swapping works on standard file-input uploads; some sites with custom drag-and-drop
> uploaders may not be supported. Binary formats (PDF/Word) are handled by the library/MCP, not the
> browser.

## 3. MCP server

```bash
uv run token-optimizer mcp        # stdio
```

```json
{ "mcpServers": { "token-optimizer": { "command": "uv", "args": ["run", "token-optimizer", "mcp"] } } }
```

Tools: `count_tokens`, `normalize_attachment`, `optimize_for_cache`, `compress_prompt`,
`dedupe_context`.

---

## What the engine does

| Feature | Mode | Guarantee | Summary |
|---|---|---|---|
| **Attachment normalization** | always on | lossless | Minify JSON/YAML, compact CSV→TSV, clean PDF/Word extraction, AST-safe code trim, cross-file dedup, delta-encode re-sent files. |
| **Cache optimization** | always on | lossless | Reorder for prefix stability + inject cache markers so you stop busting your prompt cache. |
| **Prompt compression** | opt-in | safe by default | **Low:** local rule pass removes conversational filler. **High:** shared LLMLingua-2 model on Cloud Run for stronger compression. Code & quotes never touched. |
| **Response budgeting** | always on | output-side | Provider-correct output cap, optional brevity directive, reasoning-budget clamp. |

Every transformation declares a guarantee and **reverts to a no-op if it can't be met** — a
request is never corrupted.

## Supported providers

| Provider | Models | Token counting |
|---|---|---|
| OpenAI | `gpt-*`, `o*` | Exact (`tiktoken`) |
| Mistral | `mistral-*`, `mixtral`, `codestral`, … | Exact (`mistral-common`) |
| Anthropic | `claude-*` | Estimate |
| Google | `gemini-*` | Estimate |
| Cohere · DeepSeek · xAI | `command-*`, `deepseek-*`, `grok-*` | Estimate |
| OpenAI-compatible | Groq, Together, OpenRouter, **Ollama, vLLM, LM Studio**, … | Exact with a local tokenizer, else estimate |

Estimates use a real byte-pair tokenizer with a per-provider correction and are always flagged
non-exact — never presented as exact.

## Accuracy & guarantees

| What | How it's reported |
|---|---|
| Attachment & prompt savings | Measured with the provider's tokenizer. |
| Cache savings | Measured from the response's real `usage` field, not estimated. |
| Output savings | Not claimed — the avoided amount isn't measurable without a control. |

Lossless guarantees per transform: `value-identical` (JSON/YAML/CSV), `text-lossless` (PDF/Word),
`render-equivalent` (Markdown), `ast-identical` (Python).

---

## Also included (optional)

- **Transparent proxy** (`token-optimizer start`) — point `ANTHROPIC_BASE_URL`/`OPENAI_BASE_URL` at it
  to optimize traffic from tools you can't modify. Routes by model to each provider's upstream and
  shows a live savings dashboard.
- **Hosted compression service** (`token-optimizer web`, `Dockerfile`) — the Cloud Run app that
  serves the shared LLMLingua-2 model behind High-mode compression (`POST /v1/compress`) and also
  hosts a secret-free, paste-and-see demo of the engine. It loads the quantized model from GCS at
  startup (same pattern as the BreastCancer project's `.pth`) and deploys via a keyless GitHub
  Actions workflow; if no model is configured it serves the rule pass instead. This is the one
  service all three pillars call for High-mode compression.

The proxy reuses the same engine; the hosted service additionally backs High-mode compression.

## Benchmark

Offline, on the bundled samples (no API calls):

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

Savings depend on your payloads — file-heavy and agentic (re-sent context) workloads see the most.

## Project layout

```
src/token_optimizer/
├── lib.py              Importable library: optimize / optimized / wrap / optimize_file / savings
├── providers/          Provider adapters: tokenizer, routing, cache policy, usage, schema
├── normalize/          Attachment normalization (extract, structured, textclean, code, dedup, delta)
├── compress/           Prompt compression (local rule pass + client for the hosted model)
├── cache_optimizer.py  Prefix-cache restructuring
├── response_budget.py  Output-side controls
├── optimizer.py        Engine orchestrator (shared by library, proxy, MCP, demo)
├── mcp_server.py       MCP endpoint
├── proxy/              Optional transparent proxy
├── webapp.py           Optional hosted demo
└── cli.py              start / web / mcp / stats / download-model
extension/              Browser extension (TypeScript, Manifest V3)
shared/                 Compression rules + tokenizer parity fixtures (Python ↔ extension)
```

## Development

```bash
uv sync --all-extras
uv run pytest
uv run ruff check src tests scripts

cd extension && npm install && npm test && npm run typecheck && npm run build
```

## Status

A personal portfolio project by Achyuth Kumar Baddela. Not released under an open-source license —
all rights reserved. You're welcome to read the code; please get in touch before reusing it.
