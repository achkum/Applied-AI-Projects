# ST-236 frozen PLATFORM source review C4
- PR281 exact HEAD `94bf5b7cfa0bb7976a6e6431fb4e7e2273d8d449`: **APPROVE source only**; actual C4 PG16 and acceptance remain pending.
- Relative to C3 `cc6613cdfba54a007219cd0d7c7bcf02e1e8ed1c`, executable diff is SQL010 `pg_catalog.char(3)` → `pg_catalog.bpchar(3)` and an integration catalog assertion for `bpchar` plus `atttypmod=7`.
- [PG16 pg_type.dat](https://github.com/postgres/postgres/blob/REL_16_STABLE/src/include/catalog/pg_type.dat) defines `char` as single-character OID18 without `typmodin`, and `bpchar` as length-qualified OID1042 with `bpchartypmodin`; [PG16 parse_type.c](https://github.com/postgres/postgres/blob/REL_16_STABLE/src/backend/parser/parse_type.c) raises syntax error 42601 for a modifier on a type lacking `typmodin`.
- [PG16 varchar.c](https://github.com/postgres/postgres/blob/REL_16_STABLE/src/backend/utils/adt/varchar.c) stores character typmod as declared length plus `VARHDRSZ`, so length 3 yields typmod 7; the new assertion checks the actual catalog type and length.
- SQL010 retains `NOT NULL DEFAULT 'SEK' CHECK (default_currency='SEK')`; the existing integration graph still checks stored `SEK`.
- Identity/profile grants, FORCE RLS and policies, role memberships, service/provisioner code, and other SQL declarations are unchanged; the new assertion grants no authority.
- C3 actual PG16 run `38132773842` failed at SQL010 with bounded `42601`, before Node enrollment; the receipt does not prove its first failing statement. C1/C2 actual failures remain historical.
- Require fresh exact-head C4 actual PG16 full enrollment/current-authority proof, independent QA, applicable CI and Conductor gates before merge; no usable HTTP enrollment or global deletion/refresh-race claim follows.
- Original 09:44:30.897Z L240 attempt1/source1 and 13:44:30.897Z deadline remain in force.
