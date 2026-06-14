# MCP Server Conventions

The MCP server is one of the three "plugs" into the engine. It lets an MCP-aware agent
(Claude Desktop, Cursor, a custom loop) call the optimization engine explicitly, rather
than transparently through the proxy.

## What it is

A small server exposing the engine's functions as MCP tools. Same engine, two entry points:
the proxy optimizes traffic automatically; the MCP server lets agents call it on demand.
Both record to the same shared `Ledger`, so the savings counter is consistent across plugs.

## The tools (exactly these five — see T18)

- `count_tokens(text, model) -> {count, exact}` — token count, honest about exactness.
- `normalize_attachment(filename, content_base64, model) -> {text, tokens_before, tokens_after, changes}` — full single-file normalization path.
- `optimize_for_cache(payload_json) -> {payload_json, changes}` — prefix-cache restructuring.
- `compress_prompt(text, target_ratio, model) -> {text, tokens_before, tokens_after}` — rule pass always; classifier pass only if the model is downloaded.
- `dedupe_context(named_texts, model) -> {texts, changes}` — cross-document dedup.

## Implementation

- Use the official `mcp` Python SDK.
- Transport: **stdio is primary** (works with Claude Desktop config). Mount an SSE endpoint on the
  proxy app only if the SDK makes it trivial; otherwise stdio only and note it in the module docstring.
- Tools live in `src/token_saver/mcp_server.py`.
- Tools **delegate to the same engine functions** the proxy uses (`tokens.count_tokens`,
  `optimizer.normalize_attachments`, `cache_optimizer.optimize_for_cache`,
  `compress.*`, `normalize.dedup.dedup_chunks`). Never reimplement engine logic inside a tool.

## Tool contract

Tool descriptions are what the LLM reads to decide when to call the tool — be specific and
unambiguous. Bad: "makes things smaller." Good: "Normalize an attached file (minify JSON,
compact CSV, de-hyphenate PDF text) losslessly and report tokens saved; use before sending
a file to a model."

The classifier-backed `compress_prompt` must degrade gracefully: run the deterministic rule
pass always, and only run the ONNX classifier if the model is already downloaded. If it is not,
return the rule-compressed text plus a one-line note on how to fetch the model — never block,
never auto-download inside a tool call.

## What NOT to do

- Don't add tools beyond the five above without a clear reason — the surface mirrors the engine features, not every internal function.
- Don't expose infrastructure as tools (no "ping", "health", "reset ledger" — those belong on the proxy's REST surface).
- Don't embed engine logic in the tool body — delegate to the domain modules.
- Don't return huge payloads. For `normalize_attachment`, return the optimized text and a list of
  change descriptions (strings), not the full before/after diff.

## External use & Claude Desktop integration

The server must run standalone via `token-saver mcp` (stdio). The README carries a short
`claude_desktop_config.json` snippet showing how to register it. That integration is tested
manually by the user, not in CI; the stdio round-trip (list tools → call `count_tokens` →
call `normalize_attachment` with a base64 JSON doc → assert shrinkage) is the automated test.
