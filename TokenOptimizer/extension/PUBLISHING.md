# Publishing the extension

The same Manifest V3 package works on both the Microsoft Edge Add-ons store (free) and the Chrome
Web Store ($5 one-time developer fee). Edge is the cheapest path.

## 1. Build the upload package

```bash
cd extension
npm install
npm run package        # → extension/cutok-extension.zip
```

`npm run package` runs a clean build and zips `dist/` (manifest, bundled JS, icons, and the shared
rule spec) into an uploadable archive.

## 2. Microsoft Edge Add-ons (free)

1. Register at https://partner.microsoft.com/dashboard/microsoftedge (free, no fee).
2. **Create new extension** → upload `cutok-extension.zip`.
3. Fill the listing from `STORE_LISTING.md`; add at least one screenshot.
4. Set the privacy policy URL to a hosted copy of `PRIVACY.md`, and declare **no data collected**.
5. Justify the host permission with the text in `STORE_LISTING.md`.
6. Submit for certification (typically a few days).

## 3. Chrome Web Store ($5 one-time)

1. Register at https://chrome.google.com/webstore/devconsole ($5 one-time fee).
2. **Add new item** → upload the same `cutok-extension.zip`.
3. Same listing copy, screenshot, and privacy-policy URL as above.
4. Choose visibility: **Unlisted** (shareable link, not searchable — ideal for a portfolio) or
   **Public**.
5. Submit for review.

## Notes
- The extension is MV3 and contains **no remote code**, which avoids the most common rejection
  reason.
- Hosting the privacy policy: enable GitHub Pages, or link the repo's raw `PRIVACY.md` URL.
- Bump `manifest.json` `version` for each new submission.
