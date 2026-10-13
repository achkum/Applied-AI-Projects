# ST-239 C6 independent actual QA — HOLD

2026-10-12 read-only completion of [run 38172652154](https://github.com/achkum/Applied-AI-Projects/actions/runs/38172652154), PR 284 exact head `2e8c5332674077eed24e429cc9bd9c4559723de2`; original L240 attempt 1/source 1 deadline 2026-10-11T22:18:06.654Z has elapsed. Prior C3–C5 counters remain retained; no new source, CI rerun, local PG/browser test or clock reset occurred.

Private HTTPS preflight passed. All four actual PG16/Firefox variants failed after passing the five carried browser cases (`profile`, `partial-terminal`, `empty`, `subscriptions`, `uncertainty`) in each variant.

Every sanitized sixth-case receipt has `ST239_LOGIN_AUTH_DIAGNOSTIC nonce=200 verify=409 session=NONE profile=NONE mode=NONE`, then `FAIL ST237_BROWSER_CASE case=login phase=BOB_INCOMPLETE_LOGIN_PROFILE_RESPONSE`, followed by `ST239_VERIFY_DIAGNOSTIC stage=ISSUE outcome=ROLLED_BACK sqlstate=PRIVILEGE_42501` and shell `phase=BROWSER step=STARTUP sqlstate=unavailable cleanup=removed`.

This establishes an ISSUE-stage transaction rollback with SQLSTATE 42501 privilege denial and no observed session/profile/mode response. The closed receipt does not name the denied SQL object or justify a specific grant change. The duplicated browser/status lines are shell exports of one failed case per variant.

The exact C6 source fence is the committed head and the independently reviewed source carry; this failed sixth case cannot promote final executed-bundle custody. The sixth-case contact nonmutation comparison, qualified login PG negative/transaction proof, final bundle custody, and successful six-case × four-variant gate are absent.

Only published sanitized preflight/profile receipts and four synthetic masked login PNG sets were downloaded under untracked `c6-actual-artifacts/`, including `<variant>/login/login-failure.png`; no raw private PG/browser logs, tokens, cookies, or runner logs were downloaded. **Actual QA remains HOLD** beyond the original deadline.
