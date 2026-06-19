# Store listing copy (Chrome Web Store / Edge Add-ons)

Paste these into the developer dashboard when submitting.

## Name
Token Optimizer — Prompt Optimizer

## Summary (≤132 chars)
Shortens the prompts you type into AI chat tools so they use fewer tokens. Runs in your browser.

## Category
Productivity

## Detailed description
Token Optimizer removes filler words from the prompts you type into AI chat tools, so the same
question costs fewer tokens.

When you click into a text box, a small Optimize button shows up next to it. Click it and you'll
see what would be removed; if it looks right, apply it. When you attach a JSON, CSV, or text file,
it gets compacted before it's sent.

It runs in your browser. Your text isn't uploaded or logged, and the extension makes no network
requests. It won't touch code blocks or quoted text, and it keeps a count of the tokens you've
saved.

## Single purpose (required)
Token Optimizer has one purpose: to optimize text the user is writing into an editable field, locally,
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
