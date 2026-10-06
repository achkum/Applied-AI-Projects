# ST-173 design review

**Decision: APPROVE**

I reviewed all 12 supplied production screenshots across English and Swedish, light and dark themes, and widths 320, 375, and 1280 px. The screenshots show consistent editorial hierarchy: the fictional label and household title lead, the disclosure is readable directly beneath them, and the subscription list follows with clear merchant, amount, and cadence grouping. The longer Swedish disclosure and subscription heading wrap cleanly. At 320 px, the title occupies three lines and some amount rows wrap to a second line; the content remains legible and unclipped. Desktop spacing is calm and the list remains easy to scan in both themes.

The visible language/theme controls wrap into two rows at 320 px without covering content. The return link is present and visually distinct in every state. Production browser QA reports no horizontal overflow, console errors, or API requests in the 12 route/theme/viewport scenarios; the unsupported-locale scenario returned 404. Its recorded welcome and return links each have 44 px height. The prominent fictional disclosure also correctly says the data are bundled and the page does not create a session. I found no design changes required for this scope.

Production evidence supplied by the task owner: `/workspace/.setup/ST173-web-build-final.txt` (Next 16 production build passed) and `/workspace/.setup/ST173-browser-qa.json` (13 scenarios passed: 12 combinations plus unsupported locale).

Reviewed source SHA256:

- `apps/web/app/[locale]/demo/demo-screen.tsx`: `1a8860163f23c7437d823a400a4f6d7473577dcfbcb5dc54d8c49b20afe7307d`
- `apps/web/app/[locale]/demo/demo-screen.module.css`: `d116bf0d608535420bfdc3ba551ecfe8b940aeb62131ac9c0e530db505217366`
- `apps/web/app/[locale]/welcome-screen.tsx`: `2f4768d542ffec7475f8330fd63c6300b8796d87df092cf9ee7524c8047f9dba`
- `apps/web/app/[locale]/welcome-screen.module.css`: `00d9ebb2535b58f115952e44bb1f11b7313ba2f945d736390680cb7ea89b6bc9`

Review counters: 12/12 screenshots viewed; 5 tool calls this review phase (3 image batches, 1 source-hash/evidence read, 1 evidence write); no source edits or build jobs run by design review.
