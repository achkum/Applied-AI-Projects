# Token Optimizer — Privacy Policy

_Last updated: 2026-06-14_

Token Optimizer is a browser extension that optimizes (de-fluffs and shrinks) text you choose to
optimize, **entirely on your own device**.

## What we collect

**Nothing.** Token Optimizer does not collect, transmit, store on any server, or sell:

- the content of your text or prompts,
- your browsing history or the pages you visit,
- any personal or identifying information,
- analytics or usage telemetry of any kind.

## How your text is processed

When you click **Optimize** (or use the right-click menu), the extension reads the text from the
field you are editing, optimizes it locally using bundled rules, shows you a preview, and — only if
you click **Apply** — writes the result back into that same field. This all happens inside your
browser. The text is never sent to Token Optimizer, to its author, or to any third party.

The extension contains **no remote code** and makes **no network requests**.

## What is stored locally

A single number — the running total of tokens you've saved — is kept in your browser's local
extension storage (`chrome.storage.local`) so the counter persists between sessions. It is a
number only (never your text) and never leaves your device. You can clear it at any time by
removing the extension.

## Permissions

- **Host access (all sites)** — so the extension can detect a text field on the page you're on and
  offer to optimize it. Page content is read only when you invoke optimization, and only locally.
- **`storage`** — to keep the local tokens-saved counter.
- **`contextMenus`** — to add the right-click "Optimize text" option.

## Contact

Questions: open an issue on the project repository.
