# Release notes — checkout-api 2.4.1



<!-- internal ticket: CHK-2291, do not ship this comment -->

## Summary

This release enables the new pricing engine in production and turns on the
second-generation fraud scoring model. Guest checkout remains available for all
regions.




## Changes

- Pricing is now computed by the “new” engine for every order.
- Fraud scoring v2 runs in shadow mode for EU‑West — results are logged only.
- Async receipts stay disabled until the queue migration completes.




## Rollback

If error rates climb above 2%, flip `new_pricing_engine` back to `false` and
redeploy — the old engine path is still present.
