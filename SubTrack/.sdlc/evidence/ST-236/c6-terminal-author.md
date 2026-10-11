# ST-236 C6 terminal conflict correction

- Source finding: `terminal_enrollment` has parameter `verified_h`, while `enrollment_intent` has a column with the same name. The original `ON CONFLICT (xid,verified_h)` is ambiguous under PostgreSQL 16's default PL/pgSQL variable conflict rule. This is a source finding; execution failure was not confirmed in the C5 run.
- One-line correction in SQL010 line 500: `ON CONFLICT ON CONSTRAINT enrollment_intent_pkey DO NOTHING;`. The declared primary key is exactly `(xid,verified_h)`, so the conflict arbiter remains the same. No key, grant, RLS, role, lifetime, or authority change was made.
- Static check: the diff contains only that SQL line; the original column-list conflict clause is absent, and the named clause and matching primary key are present. No PostgreSQL runtime result or CI/QA claim is made here. The existing full-service actual proof must exercise the terminal path before acceptance.
