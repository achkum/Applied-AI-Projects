# ST-235 frozen security source review — REQUEST_CHANGES
Frozen commit `b0a8a4a59eb7fc19c957aebff5aa0c5e42f6b841`; static review only. Original 2026-10-11T08:04:01Z L240/source attempt 1 unchanged; PG16/CI/QA pending.
**Blocker:** `durable-current-web-authority.ts` `OwnerTx.query` admits arbitrary `SELECT` and rejects only unquoted `set_config`. `SELECT pg_catalog."set_config"('app.user_id',$1,true)` and the analogous `app.current_user_id` call pass its regex.
A callback can set both GUCs to a victim UUID, read victim rows through ordinary `public.identity` RLS, restore both to signed `sub`, and return those rows. The final private checker then passes; signed owner authority no longer bounds business reads.
Replace this SQL-text capability with a constrained owner-scoped operation/repository or a boundary that cannot run GUC/role-changing SQL, then prove the quoted-function case and final witness after callback. Regex additions alone are fragile.
**Lock protocol:** adapter fences/locks epoch before identity, while fixture locks identity/nonce before `issue_fixture` locks epoch. Same-owner concurrent issue/request can deadlock; align ordering and prove the race.
SQL 009 grants/RLS/fixtures otherwise showed no concrete preprincipal or production grant widening in static review; SQL 001–008 and canonical grants are unchanged.
No qualified PG16 proof or CI pass is inferred from this review. Security veto remains until frozen corrected source and actual gates pass.
