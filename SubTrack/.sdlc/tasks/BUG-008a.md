---
id: BUG-008a
title: Canonical clean-install Prisma schema target
type: bug
milestone: M2
owner_role: architect-platform
reviewers: [architect-platform, security-privacy, qa-engineer]
size: M
labels: [database, security]
status: IN_REVIEW
depends_on: []
allowed_paths:
  - SubTrack/apps/api/prisma/schema.prisma
  - SubTrack/apps/api/prisma/reconciliation-target.json
  - SubTrack/.sdlc/evidence/BUG-008/**
  - SubTrack/.sdlc/tasks/BUG-008.md
  - SubTrack/.sdlc/tasks/BUG-008a.md
  - SubTrack/.sdlc/backlog.yaml
---

## Goal and parent scope
Phase A of the explicitly amended BUG-008 contract: restore the canonical Prisma target for the six missing banking/catalogue/transaction/charge models, reconcile subscription metadata, and define an independent expected-schema fixture. Founder reports no existing databases; accepted privacy and data-model scope remain authoritative. Authoring was dispatched under the parent's Phase A contract; this child separates the reviewable schema PR from later SQL/PG work under the one-task-one-PR rule.

## Acceptance and limits
Preserve identity/session/household/OTP/invitation and canonical subscription/share models; use BigInt money, canonical provider enums, source-backed pending date semantics and composite owner foreign keys. Do not store raw provider payloads or invent producer/delivery/persistence activation. Record SQL-only checks, owner immutability, grants and RLS requirements explicitly; Prisma syntax is not PostgreSQL privacy evidence.

Independent exact platform/security source reviews and QA must approve schema and fixture hashes. Prisma validate/generate/API typecheck and JSON parsing must pass, followed by required exact-head CI. No migration/SQL/DB/reset/DROP/force operation in this child. <=600 nongenerated changed lines including the parent's inventory/plan/amendment evidence.

## Handoff
Schema EE08405408AD04D5917263FEDE3FF09604EAFEFD40ED37DD1811669D92E20AEC; fixture 3FB7C637EE7EFBC7AFF6422428EEA6338550FE153F14B11CFD4605F0F8911FC4. Independent platform/security approve exact Phase A target; QA confirms Prisma validation/client generation/API tsc/JSON parse/diff checks. Final CI remains open. Parent BUG-008 remains IN_PROGRESS until separate exact SQL review and real disposable PostgreSQL migration/RLS proof pass.
