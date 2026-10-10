# ST-081c platform source review — attempt 1

Disposition: **SOURCE CONDITIONS MET; MERGE BLOCKED ON EXECUTION EVIDENCE**. This is a review of the exact working-tree bytes below, based on `97ed2ac85495866524d97b62bb4050085cdf27c4`; it is not an approval of a later PR head or a claim that PostgreSQL or the production image ran.

The private writer uses the accepted `withRequestTransaction` to set both matching transaction-local identity GUCs. It locks by subscription UUID **and** principal UUID, checks the returned owner, applies the accepted decision helper to the locked status, and updates conditionally by owner and old status in the same transaction. Its action gate permits only pause, resume, cancel, and archive; the helper plus status gate permits precisely the seven UF-08 ordinary transitions. Invalid pairs conflict; missing and owner-invisible rows share `SUBSCRIPTION_NOT_FOUND`; unexpected driver errors become `SUBSCRIPTION_STORAGE_ERROR`. It returns only ID and status. A future caller must independently establish the current principal; this private repository does not authenticate a token.

The PG fixture source asserts an ordinary nonowner LOGIN role, RLS, owner success for all seven pairs, peer/share/open-book/always-private and unrelated denial, serialized same-row actions, stale conflict, rollback, and connection-local GUC cleanup. These are assertions awaiting an actual disposable PG16 run. The runner ignores ambient `DATABASE_URL`, records a labelled container CID, checks the exact label/CID before removal, and bounds temporary-directory cleanup. The package export points to a narrow built domain artifact; API build scripts and the dedicated proof build it first. Docker build and runtime copy domain and money; the image smoke exercises the compiled helper and repository import and the API startup path. Node 22 CommonJS loading of this ESM artifact remains an image execution condition.

Before merge, require green exact-head frozen install and applicable API lint/typecheck/unit/coverage, dedicated owned PostgreSQL 16 proof with its PASS receipt and verified cleanup, independent QA/security acceptance of that PG result, and actual Node 22.18 production image build/start plus compiled import smoke. Confirm the final PR-head hashes against this snapshot and repeat this review if relevant source changes. No source-only disposition substitutes for those gates.

SHA-256 snapshot:

| File | SHA-256 |
| --- | --- |
| `apps/api/src/subscriptions/subscription-lifecycle.repository.ts` | `629F23ED703C04B187AB6714A46920767FEE27C7E32A03B62786DC69D8425CE4` |
| `apps/api/src/subscriptions/subscription-lifecycle.repository.spec.ts` | `8A40C2483A5BAF3856BB1F28D86E941AF6CB247041BB53CC384A8C036D4A7547` |
| `apps/api/test/subscription-lifecycle-storage.integration.ts` | `2005A4F2D7ADDE49D333D43F35D7DDE29CF2009496755A970E0E72DF126D29D0` |
| `tools/database/subscription-lifecycle-proof.sh` | `B9B56AA91949E84083E63B52CAD79BB7C1C6A7FB272F3A761840B23ED8C86BD6` |
| `apps/api/Dockerfile` | `D773A6F7B5DB54A3BE8211B5D74958337AB6B8E5A4A391F41715FC21DFE7386D` |
| `packages/domain/package.json` | `F357F40517BD1FE6FE915BC93D57BA631724BEDE9F91C44AB3D1170F3917569F` |
| `packages/domain/tsconfig.lifecycle.json` | `DD86AFE60AC0BAC500E5F8F899693A19BCBDCA4A61CD46B602156D3DA6E618F5` |
| `apps/api/package.json` | `9C70B3680BFAEA0D0760D131371522E6CEE907CA5B5710C6F74752C111D2E651` |
| `pnpm-lock.yaml` | `43DA473F737791E365A8CF404F7CFA4AD5583CEDB669F526EDCF75CE0B5B15AF` |
| `tools/containers/smoke-images.sh` | `19EC5F9E6C929644377592029D5C694F5E1E27D857DDF78555F8E13A35988492` |
| `.github/workflows/subtrack-subscription-lifecycle-proof.yml` | `21243AB8C263E5694EF0F6F5BDEB4ED54ECC21AF9B98993F1BF5FB2E49E1F2AE` |
