# ST-173 architect-platform review

Date: 2026-10-06
Decision: **APPROVE**

This decision is bound to the SHA-256 snapshot below. It approves the amended public JSON presentation boundary, generation/freshness behavior, runtime import arrangement, narrow lint exception, and dependency/lock scope. Root owns the production build and combined task gates; this approval does not substitute for them. I did not run tests or builds.

The route consumes only `@subtrack/ui/demo-fixture`; its runtime performs no amount conversion or formatter import. The generated DTO has six source-ordered rows with original cadence, currency, and minor-unit decimal strings plus exact bilingual labels, without totals. Generation checks `Number.isSafeInteger` before `BigInt`, formats both locales with the public formatter, assembles all rows before writing, and atomically renames a same-directory temporary file. The focused regression test now verifies unsafe input does not call the formatter, a late locale formatter error leaves the destination byte-identical with no temporary file, and success replaces the destination without residue. Normal test mode compares the checked-in JSON with canonical source/formatter output without calling the generator. The boundary test now uses the real demo-screen path and verifies the approved UI JSON subpath is allowed while direct money/synthetic imports remain denied. The lint change adds only `**/.next/**`; existing alias denials remain intact. The web manifest retains its existing client dependencies and has no direct money/synthetic dependency; the lockfile delta is limited to the UI tooling synthetic workspace link.

## Reviewed file checksums

```text
6e564dfff0f9585498884b139124a5fd92f2c352845e1af9cdcc5820aaaca188  SubTrack/packages/ui/scripts/generate-demo-fixture.ts
96334b9114b84ab73f1b2f8f41c889b6345942c97b2457e1fc4df606888a07a7  SubTrack/packages/ui/src/demo-fixture.test.ts
6ba2dab2d16cd54aa41c1c7e8d4377a931b5b1d34ec2573706e65153b10dfc982  SubTrack/packages/ui/src/generated/demo-fixture.json
e47aadbac0a5defc7819c1c7e8d4377a931b5b1d34db2d3b8b8bd38bd9ddcdad  SubTrack/packages/ui/package.json
1a8860163f23c7437d823a400a4f6d7473577dcfbcb5dc54d8c49b20afe7307d  SubTrack/apps/web/app/[locale]/demo/demo-screen.tsx
dadc6f487697d6dbc9cab227d105c36b9130e5dc72333d8055c057c933fe4812  SubTrack/packages/config/eslint.config.mjs
d066611d0e6cf56d70bc9185883c5481296a13727ece06c512cd144e5bcae659  SubTrack/packages/config/test/boundaries.test.mjs
91860d40119580615b0a10ef75c4639f876d402233908ceee19d78aca8d47a37  SubTrack/apps/web/package.json
639a7e71c04551dfea3f24a4e1ca7250dc72e7df59caa258bcee94429b9770ed  SubTrack/pnpm-lock.yaml
```

Review call count: 11, including one failed ordinary shell startup and subsequent escalated reads/writes. No Git, board, provider, or network writes were made.
