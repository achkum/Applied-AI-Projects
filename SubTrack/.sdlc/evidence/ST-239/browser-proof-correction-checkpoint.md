# ST-239 browser proof correction checkpoint

2026-10-11, original source attempt 1 and 18:18:06.654Z–22:18:06.654Z deadline retained. This is a proof-source correction only; product/API/SQL source remains frozen. Prior client author and correction work totals approximately 52 calls; this narrow continuation used 7 tool calls. No actual qualified browser or database result is claimed.

The login branch now emits the exact common shell marker `PASS ST237_BROWSER_CASE case=login locale=... theme=...` after its final fresh-recovery list and private response checks. Its three ST239 markers remain at the same completion point. All five accepted ST238 cases remain in the driver.

One reusable response observer is attached to the original page and every replacement login/enrollment page. It checks no-store and Pragma headers, complete cookie attributes and no verifier `Set-Cookie`, and records path/status without values. Pending response checks settle before each private wire assertion. Intercepted verifier and deliberately lost session responses receive the same header/cookie inspection. CSRF stays volatile in this driver and is never logged.

After natural Bob enrollment and its independent profile/mode reads, the browser creates uppercase private handshake marker `CONTACT_SNAPSHOT_READY` and waits for PG owner's `CONTACT_SNAPSHOT_CAPTURED` release before Bob's first fresh login. This allows the shell owner to capture complete natural Alice/Bob `public.identity` rows and later compare them without printing contact values. PG owner and Conductor were informed of the exact marker names. Qualified contact nonmutation remains pending actual shell execution.

`node --check apps/web/test/private-profile-browser.mjs` PASS; `git diff --check` PASS. SHA-256 of browser driver: `44acec1fdcda1fb1cde6e77ff7cc53d1ae0c6b1ee153a56981400c8f5cea2015`. The previously reported 139 web tests, four focused decoder tests, web typecheck and Next build belong to earlier source checkpoints; they were not rerun for this proof-only edit. Exact-head qualified PG16/private HTTPS browser and direct pixel review remain blocking.
