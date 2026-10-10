# Private subscription lifecycle decision core

`getNextSubscriptionStatus(currentStatus, action)` computes the allowed next status for the exact status/action pairs below. The exported unions define the supported status and action strings; runtime checks also reject values outside those unions with `Error('LIFECYCLE_CONFLICT')`.

| Current status | Action | Next status |
| --- | --- | --- |
| DETECTED | confirm | ACTIVE |
| DETECTED | reject | REJECTED |
| DETECTED | archive | ARCHIVED |
| TRIAL | activate | ACTIVE |
| TRIAL | cancel | CANCELLED |
| TRIAL | archive | ARCHIVED |
| ACTIVE | pause | PAUSED |
| ACTIVE | cancel | CANCELLED |
| ACTIVE | archive | ARCHIVED |
| PAUSED | resume | ACTIVE |
| PAUSED | cancel | CANCELLED |
| PAUSED | archive | ARCHIVED |
| CANCELLED | archive | ARCHIVED |
| REJECTED | archive | ARCHIVED |

Every other status/action pair, including every action from ARCHIVED, throws a new `Error('LIFECYCLE_CONFLICT')`. The helper compares primitive strings directly, without coercing inputs or looking up object properties.

This function only calculates a result from the values supplied by its caller. It does not verify that the status is current, authenticate a caller, establish ownership or permission, read or mutate a record, or provide version checking, idempotency, audit, atomicity, persistence, or RLS guarantees. Callers retain those responsibilities. Edit, merge, undo, and missed-charge automation are outside this helper.
