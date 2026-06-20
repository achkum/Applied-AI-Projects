# TypeScript / Browser Extension Conventions

Project: the `token-optimizer` browser extension (Pillar 2) — a Manifest V3 extension that adds an
**Optimize** button to editable text fields on **any site**, plus attachment compression on file
uploads. Prompt compression calls the shared Cloud Run compression service (the LLMLingua-2 model)
through the background worker; there is no in-browser compression model.

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
├── scripts/make_icons.py   # one-off icon generator (dev tool, not part of the bundle)
├── src/
│   ├── content.ts          # content script: finds the text field, injects the Optimize button
│   ├── sites.ts            # per-site adapters (claude.ai, chatgpt.com, generic fallback)
│   ├── service.ts          # client for the Cloud Run /v1/compress endpoint
│   ├── settings.ts         # the service endpoint, persisted in chrome.storage.local
│   ├── background.ts       # service worker: cross-origin fetch to the compression service, context menu
│   ├── attachments.ts      # lossless compression of attached files before upload
│   ├── tokens.ts           # gpt-tokenizer + the Anthropic heuristic (ported EXACTLY from Python)
│   ├── panel.ts            # shadow-DOM diff panel (Apply / Cancel)
│   ├── diff.ts             # LCS word-level diff (~80 lines, no dependency)
│   ├── storage.ts          # tokens-saved counter in chrome.storage.local
│   └── __tests__/          # vitest specs
└── dist/                   # build output (gitignored)
```

## Manifest V3 rules

- Permissions: `storage`, `contextMenus`, `activeTab`. The Optimize button works on any site, so
  the content script runs broadly; `host_permissions` includes `https://*.run.app/*` so the
  background worker can reach the compression service. Keep the permission set as narrow as the
  feature allows and justify each one in `STORE_LISTING.md`.
- **No remote code.** Everything ships in the bundle; the manifest must validate as
  remote-code-free. Compression sends *text* to the service and gets text back — that is data over
  `fetch`, not executable extension code.
- The floating button survives SPA navigation via a `MutationObserver`. Compression requests go
  through the background service worker (not the page) to avoid the host page's CSP.

## Token-count parity (the cross-language contract)

`shared/token_test_vectors.json` pins token counts that **both** the Python engine and this
extension assert, so the JS token counter (`tokens.ts`) and the Python one stay in lockstep. When
you change tokenization on either side, update the fixtures and run both test suites. The Anthropic
heuristic in `tokens.ts` must match the Python implementation exactly.

Prompt compression itself is **not** done in the browser — it is a `fetch` to the shared model
service (`service.ts` → `/v1/compress`), so there is no rule spec or compression logic to keep in
sync across languages anymore.

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
- Never block the UI thread. Clicking Optimize awaits the compression service through the background
  worker; if it isn't configured or is unreachable, the button says so instead of opening the panel.

## Attachment normalization (mirrors the Python contract)

Attachment compression in the browser obeys the same lossless rules as the engine: minify JSON/CSV
losslessly, **never alter text inside code fences or inline backticks**, and revert to the original
file when a transform can't prove its guarantee. Keep `attachments.ts` behavior aligned with the
Python normalizers.

## Testing

- `vitest` + jsdom. Tests live under `src/__tests__/`.
- Adapter tests use jsdom fixtures of each site's DOM shape. The compression service is mocked
  (the content script asks the background worker) — never hit a real network in CI.
- Test user-visible behavior (button appears, Apply replaces text, counter accumulates), not
  internal call order.

## Don't

- No analytics, no telemetry. The only network call is the opt-in compression request to the
  service (text in, compressed text out) — nothing else leaves the browser.
- No `dangerouslySetInnerHTML`-style raw HTML injection from page content into the panel.
- No storing prompt text anywhere except transiently in memory and the running tokens-saved
  total in `chrome.storage.local` (a number, not the text).
