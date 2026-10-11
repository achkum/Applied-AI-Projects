# ST-236 frozen C4 security source review
Decision: **APPROVE security source only** at PR281 HEAD `94bf5b7cfa0bb7976a6e6431fb4e7e2273d8d449`; actual C4 PG16, QA, and exact-head CI remain pending.
Relative to C3 `cc6613cdfba54a007219cd0d7c7bcf02e1e8ed1c`, the only executable changes are SQL010 `public.identity_profile.default_currency` from invalid `pg_catalog.char(3)` to `pg_catalog.bpchar(3)` and an integration catalog assertion requiring that exact type and typmod 7.
The column retains `NOT NULL DEFAULT 'SEK' CHECK (default_currency='SEK')`; the existing graph assertion still checks stored `SEK`.
The diff leaves identity/profile ACLs, RLS policies, role memberships, service/provisioner logic, and all other SQL declarations unchanged. The new assertion adds no authority or runtime path.
C3's bounded SQL010 `42601` is consistent with the invalid type syntax but does not identify its first failing statement. No C4 PG16 execution or Node enrollment success is claimed.
C1/C2/C3 actual failures remain recorded. Acceptance requires fresh exact-head actual PG16 proof, independent QA, applicable CI, and Conductor gates; no usable HTTP enrollment or global deletion/refresh race claim follows from this review.
