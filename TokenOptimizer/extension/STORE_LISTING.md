# Store listing copy (Chrome Web Store / Edge Add-ons)

Paste these into the developer dashboard when submitting.

## Name
Token Saver — Prompt Optimizer

## Summary (≤132 chars)
Optimize any prompt before you send it. De-fluff and shrink your text locally — on any site.
Nothing leaves your browser.

## Category
Productivity

## Detailed description
Token Saver helps you write tighter prompts and cut the token cost of every LLM you use.

Focus any substantial text box — on ChatGPT, Claude, Gemini, your own app, anywhere — and a small
**⇣ Optimize** button appears. Click it to:

• remove conversational filler and politeness scaffolding (safe by default),
• collapse redundant wording,
• preview a clear before/after diff, and apply with one click.

Everything runs locally in your browser. Your text is never uploaded, logged, or sent anywhere —
the extension contains no remote code and makes no network requests. Code blocks and quoted text
are never altered.

A running "tokens saved" counter shows your cumulative savings.

## Single purpose (required)
Token Saver has one purpose: to optimize text the user is writing into an editable field, locally,
to reduce the number of tokens sent to a language model.

## Permission justifications
- **Host permission (all sites):** required to detect the editable text field on the page the user
  is on and to render the optimize button next to it. The page's text is accessed only when the
  user explicitly invokes optimization, and is processed entirely on-device.
- **storage:** stores a single number — the cumulative tokens-saved counter — locally.
- **contextMenus:** adds the right-click "Optimize text" menu item.

## Data usage disclosure
- Does the extension collect user data? **No.**
- Remote code: **No.**
- Privacy policy URL: link to `extension/PRIVACY.md` (host via GitHub Pages or the repo's raw URL).

## Assets needed before submitting
- Store icon: `icons/icon128.png` (included).
- At least one screenshot, 1280×800 or 640×400 (capture the Optimize button + diff panel in use).
