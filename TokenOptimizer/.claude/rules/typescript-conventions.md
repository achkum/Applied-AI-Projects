# TypeScript / Browser Extension Conventions

Project: the `token-saver` browser extension (Plug 3) — a Manifest V3 extension that adds a
"compress" button to claude.ai and chatgpt.com prompt boxes, running the same compression
rules as the Python engine, fully in-browser.

## Versions and tooling

- Node 20+. Use **npm** (the dev-tasks specify `npm run build` / `npm test`). Lockfile is `package-lock.json`.
- TypeScript strict mode on (`"strict": true` in `tsconfig.json`).
- Bundler: **esbuild** (`extension/esbuild.mjs`) → `extension/dist/`. No webpack.
- Tests: **vitest** with jsdom for DOM-dependent code.
- No framework. This is a content script + a shadow-DOM panel, not a React app. Do not pull in React/Vue/Svelte.

## Code style

- TypeScript everywhere. No JS files except config (`esbuild.mjs`, `vitest.config.ts`).
- Prefer `type` over `interface` unless extending an external interface. Be consistent — we use `type`.
- Named exports. Avoid default exports.
- Avoid `any`. Use `unknown` with a type guard when the shape isn't known. DOM queries return
  `HTMLElement | null` — handle the null, don't assert.
- No barrel files. Import from the actual file path.

## File organization

```
extension/
├── manifest.json            # Manifest V3, minimal permissions
├── package.json
├── tsconfig.json
├── esbuild.mjs              # build to dist/
├── src/
│   ├── content.ts          # content script: finds prompt box, injects button
│   ├── sites.ts            # per-site adapters (claude.ai, chatgpt.com, fallback)
│   ├── ruleCompressor.ts   # port of the Python rule pass; reads shared/compression_rules.json
│   ├── tokens.ts           # gpt-tokenizer + the Anthropic heuristic (ported EXACTLY from Python)
│   ├── panel.ts            # shadow-DOM diff panel (Apply / Cancel)
│   ├── diff.ts             # LCS word-level diff (~80 lines, no dependency)
│   ├── classifier.ts       # lazy transformers.js classifier, runs in a worker
│   └── __tests__/          # vitest specs
└── dist/                   # build output (gitignored)
```

## Manifest V3 rules

- Permissions: `storage`, `contextMenus`, `activeTab` **only**. No `<all_urls>`, no host
  permissions beyond `https://claude.ai/*` and `https://chatgpt.com/*`.
- **No remote code.** Everything ships in the bundle; the manifest must validate as
  remote-code-free. The transformers.js model is fetched by the library into its own browser
  cache at runtime on explicit opt-in — that is data, not executable extension code.
- Content scripts only on the two supported hosts; the floating button survives SPA navigation
  via a `MutationObserver`.

## Shared rule spec (the cross-language contract)

`shared/compression_rules.json` is the single source of truth for compression rules, consumed
by **both** the Python engine (T19) and this extension (T22). When you touch it:

- Regex must stay in the **JS-compatible subset**: no variable-length lookbehind, no named
  groups `(?P<...>)`. The file documents this at the top — honor it, because the same patterns
  run under Python `re` and JS `RegExp`.
- The build step copies `shared/compression_rules.json` into `dist/`. Do not fork or duplicate
  the rules into the TS source.
- `ruleCompressor.ts` must produce semantics identical to the Python `apply_compression_rules`:
  same prose/code splitting, same file-order application, same flags. `shared/token_test_vectors.json`
  is asserted in both languages to keep them in lockstep.

## DOM & site adapters

- All site-specific knowledge lives in `sites.ts` as `{ match(url), findPromptElement(), getText(el), setText(el) }`.
  Content code never hard-codes a selector inline.
- `setText` must dispatch an `input` event so the host app's framework state updates — setting
  `.value`/`.textContent` alone is not enough for React-controlled inputs.
- Provide a fallback heuristic (largest visible contenteditable/textarea in the bottom 40% of
  the viewport) so a selector change on either site degrades instead of breaking.

## UI

- The diff panel lives in a **shadow DOM** so the host page's CSS can't break it (and ours can't
  leak). Inline styles within the shadow root are fine here — this is the one place Tailwind-style
  external CSS doesn't apply.
- Word-level diff: deletions struck through, token count before → after, **Apply** / **Cancel**.
- Never block the UI thread. The rule-compressor result shows instantly; the transformers.js
  classifier (opt-in "Deep compress") runs in a **web worker** and refines the result when ready.
  WebGPU unavailable → WASM backend automatically.

## Code-fence safety (mirrors the Python contract)

Compression in the browser obeys the same hard rule as the engine: **never alter text inside
code fences or inline backticks.** The fence-splitting logic in `ruleCompressor.ts` must match
the Python implementation's behavior.

## Testing

- `vitest` + jsdom. Tests live under `src/__tests__/`.
- Adapter tests use jsdom fixtures of each site's DOM shape. Classifier tests inject a fake
  pipeline with deterministic scores — never download the real model in CI.
- Test user-visible behavior (button appears, Apply replaces text, counter accumulates), not
  internal call order.

## Don't

- No analytics, no telemetry, no network calls except the opt-in model download. The extension
  is local-first, same as the engine.
- No `dangerouslySetInnerHTML`-style raw HTML injection from page content into the panel.
- No storing prompt text anywhere except transiently in memory and the running tokens-saved
  total in `chrome.storage.local` (a number, not the text).
