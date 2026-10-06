# ST-173 architect-client review

```yaml
contract: REVIEW/v1
task_id: ST-173
reviewer: /root/web_demo_client_review
verdict: APPROVE
summary: >-
  The localized web demo and welcome navigation satisfy the client presentation contract and consume only the approved UI JSON display entry. The route is read-only, bilingual, and explicit that the data is fictional.
findings: []
```

This approval is limited to the client route, presentation, locale catalogs, and package/export surfaces listed in the fingerprints below. Root reports that the platform reviewer approved the final generator, UI freshness test, and actual-path boundary test; those updated tooling and boundary files are delegated to that final architect-platform receipt and are not covered by this client approval.

The route imports only `@subtrack/ui/demo-fixture` plus localized catalog copy. The UI package manifest exposes that JSON file as a public subpath; the web manifest has no direct money or synthetic dependency. The reviewed display DTO carries six fixture rows in source order with merchant, original cadence/currency, original minor amount as a decimal string, and localized amount strings. The web component presents each formatted amount and cadence, renders localized unavailable copy for a missing display label, and shows no household total. It performs no money conversion, network access, authentication/session work, persistence, provider access, or browser storage. Locale validation and matching welcome/demo links are handled by the route boundary. Styles use existing theme tokens and links have 2.75rem minimum height.

Focused route tests were read but not executed by this reviewer. They cover both locales, six displayed rows, localized amount/cadence, invalid locale handling, unavailable labels, and axe in light/dark themes. No browser screenshots were inspected. Production build/browser QA and design-lead visual review remain separate gates.

The shared lint allowlist for `@subtrack/ui/*` predates this task and is unchanged. The earlier duplicate dependency observation also existed in `HEAD`; root removed those identical duplicate entries while the manifest was in scope.

Client-scoped source fingerprints (SHA-256, as reviewed):

| File | SHA-256 |
|---|---|
| `apps/web/app/[locale]/demo/page.tsx` | `8d840ece2371be9e3e856bc3e23e050635156102940decdbc2bc676a6cceb7d2` |
| `apps/web/app/[locale]/demo/demo-screen.tsx` | `1a8860163f23c7437d823a400a4f6d7473577dcfbcb5dc54d8c49b20afe7307d` |
| `apps/web/app/[locale]/demo/demo-screen.module.css` | `d116bf0d608535420bfdc3ba551ecfe8b940aeb62131ac9c0e530db505217366` |
| `apps/web/app/[locale]/welcome-screen.tsx` | `2f4768d542ffec7475f8330fd63c6300b8796d87df092cf9ee7524c8047f9dba` |
| `apps/web/app/[locale]/welcome-screen.module.css` | `00d9ebb2535b58f115952e44bb1f11b7313ba2f945d736390680cb7ea89b6bc9` |
| `apps/web/app/[locale]/page.tsx` | `923d5ff928bd63ac0e409ba3a1edcfa9ba94875948adc59dae699c095247ee0b` |
| `apps/web/test/demo-route.test.tsx` | `2f2fe97b39dd9caa7960db0885c8c076b177b3306b9904573466adf2bf0e17dd` |
| `apps/web/test/welcome-route.test.tsx` | `b081ec9aae20e1f9721fa98114aa7986ad999c97a28d4b0742696a41f4b39177` |
| `apps/web/package.json` | `91860d40119580615b0a10ef75c4639f876d402233908ceee19d78aca8d47a37` |
| `packages/i18n/catalogs/en.json` | `b542e4f73a9487cc60ad93f572e257261adee2db7fb4a2005ab808e29c7aaae6` |
| `packages/i18n/catalogs/sv.json` | `dba0bd635b73f9c315a24f029119868352e59629bcde4f0b3369977aaad08ff7` |
| `packages/ui/package.json` | `e47aadbac0a5defc7819c1c7e8d4377a931b5b1d34db2d3b8b8bd38bd9ddcdad` |
| `packages/ui/src/generated/demo-fixture.json` | `6ba2dab2d16cd54aa41c1b2550cdffa8ca19dc34ec2573706e65153b10dfc982` |
| `pnpm-lock.yaml` | `639a7e71c04551dfea3f24a4e1ca7250dc72e7df59caa258bcee94429b9770ed` |
