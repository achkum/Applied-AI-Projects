# Store listing copy (Chrome Web Store / Edge Add-ons)

Paste these into the developer dashboard when submitting.

## Name
Token Optimizer — Prompt Optimizer

## Summary (≤132 chars)
Shortens the prompts you type into AI chat tools so they use fewer tokens, using your own compression service.

## Category
Productivity

## Detailed description
Token Optimizer shortens the prompts you type into AI chat tools, so the same question costs fewer
tokens.

When you click into a text box, a small Optimize button shows up next to it. Click it and the
prompt is sent to the compression service you configure (a self-hosted model endpoint set in the
extension options); you'll see a preview of what changed, and apply it if it looks right. When you
attach a JSON, CSV, or text file, it is compacted in your browser before it's sent.

The prompt text is sent only to the endpoint you configure, only when you click Optimize — there is
no other server, no analytics, and no logging. If you don't set an endpoint, nothing is sent. It
won't touch code blocks or quoted text, and it keeps a local count of the tokens you've saved.

## Single purpose (required)
Token Optimizer has one purpose: to reduce the number of tokens in text the user is writing into an
editable field, by compacting attachments locally and compressing prompt text via a user-configured
compression service.

## Permission justifications
- **Host permission (all sites):** required to detect the editable text field on the page the user
  is on and to render the optimize button next to it. The page's text is accessed only when the
  user explicitly invokes optimization; attachments are processed on-device, and prompt text is sent
  only to the user-configured compression endpoint.
- **storage:** stores the cumulative tokens-saved counter and the compression service URL, locally.
- **contextMenus:** adds the right-click "Optimize text" menu item.

## Data usage disclosure
- Does the extension collect user data? **No** — it has no backend or analytics. Prompt text is
  transmitted only to the compression endpoint the user configures, solely to perform the
  compression the user requested.
- Remote code: **No.**
- Privacy policy URL: link to `extension/PRIVACY.md` (host via GitHub Pages or the repo's raw URL).

## Assets needed before submitting
- Store icon: `icons/icon128.png` (included).
- At least one screenshot, 1280×800 or 640×400 (capture the Optimize button + diff panel in use).
