# V4 phone feedback: incomplete product, not accepted

Founder tested the signed V4 Android app on 2026-10-17. Profile access does not establish product acceptance. The supplied phone screenshots expose an incomplete POC relative to the approved HTML, not just cosmetic defects. No successor or feature completion is claimed by this audit.

## Source-confirmed gaps

- `NativePersonalScreen.tsx` explicitly disables Bank and Detection with `loading || sandbox`; detected-row navigation is also hidden in sandbox. `_layout.tsx` SandboxRouteBoundary excludes `/personal-bank` and `/personal-detections`. This is not caused by unavailable real bank credentials.
- Existing Bank/Detection components use NativeSession and private development API transports. The delivered sandbox instead uses SandboxSession and `sandboxMobileApi`. `packages/contracts/sandbox-mobile.ts` permits only profile/mode/owner-read/manual/manual-edit/status. The sandbox server dispatches that limited business contract. Simply removing disabled flags would leave unusable routes and the wrong authority/transport.
- A reusable Synthetic bank provider, transaction ingestion, detection and review implementation exists in the repository. The delivered sandbox does not connect it to the installed user's isolated identity. Synthetic recurring transaction history must exercise ingestion/detection/review and persist results; adding static subscription cards would not meet the founder's request.
- NativeProductNav exposes Month, Upcoming and Manage. The approved HTML exposes Home, Subscriptions, Household, Insights and Profile, with comparison actions. Household, comparisons and insights remain unfinished in the recorded delivery groups. They are not hidden working pages in V4.
- Personal setup and its sandbox business contract support only Just me. The product specification explicitly requires My household and profile-only dependants as well as invitations. Existing unrelated household services are not evidence that these native sandbox workflows work.
- Add/Edit renders every category as a button, repeats selected category/cadence text, and accepts the date through a generic TextInput. Founder requests a searchable category input with suggestions and support for a new category, plus a date picker. New category handling needs an explicit supported persisted contract, not silently coercing unknown text into an existing category.
- Billing Month's header calendar is a plain BillingIcon, not an interactive control. It should open a useful date/month selection. Founder also marked the blank selected-day panel as unnecessary; do not remove populated day detail or the reference date ribbon indiscriminately.

## Correction order and acceptance

1. Complete automatic affected-change CI selection before pushing another feature loop; retain actual final Android/backend/signing gates and build the delivery binary once per frozen candidate.
2. Wire the existing Synthetic bank and detection path through the isolated sandbox contract/authority, shared screens and navigation. Provide varied synthetic recurring histories and exclusions; verify sync, actual detected candidates, confirm/reject and durable subscription readback after restart. Preserve existing manual data and installation capability; no reset or real integration.
3. Complete native household/dependant setup and scoped member views, then dedicated insights/comparison views following the approved reference. Use persisted synthetic evidence and deterministic Money; never present fictional HTML market prices, savings or scores as verified facts. Synthetic comparisons must be identified in their relevant content without reinstating global Sandbox stickers or verbose explanation blocks.
4. Replace category wall/date text entry with usable controls, remove duplicate selected-value prose and make calendar control functional; inspect actual installed populated and empty states.
5. Compare the installed page/interaction inventory against the approved HTML before calling a successor ready. Component tests and a passing personal-subscription suite cannot substitute for missing product workflows.

Android only, one agent. No accounts, spending, real bank/SMS/email/LLM integration, production/store release or automation. The founder's permission to use extensive synthetic bank/test data is explicit in this feedback. V4 remains the delivered historical artifact, not an accepted complete POC. No code change or new build was performed during this audit.
