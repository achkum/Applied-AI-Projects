# ST226 actual Prisma compatibility context5 checkpoint
HANDOFF/v1; original2026-10-10T23:17:14Z attempt1 L240/counters preserved; task pre-edit cap author1150/total1500; original CI failures retained.
Runtime replaces only descriptor binding of Prisma methods with accepted READ callable-property checks, preserving original caller-owned Prisma and descriptor-bound access/principal/repository/CSRF; role/RLS/provenance unchanged.
Real installed Prisma6.19.2 disconnected regression retains proxy method nonfunction descriptor values, intercepts internal request rejection once, reaches storage preflight denial, and proves no connect/disconnect/Nest creation; noncallable methods deny before preflight. Existing authority getter tests retained.
Focused composition+launcher 2files73tests PASS; composition coverage statements93.15/branches95.57/functions83.33/lines97.22; launcher92.94/89.65/86.95/97.52; all metrics>=80.
Lint/type/build/diff-check PASS; fresh fullAPI76files1668tests PASS zero skips; parent diagnostic/exit helpers2 PASS by name-filtered invocation, actual Linux case excluded by invocation only.
Windows Node24.14.0/pnpm12.6.0, Git mingw64/bin+usr/bin+Node corepack/shims PATH; corepack pnpm --filter @subtrack/api test; private c5-full.log SHA256 8b8641119af3f099256f15a3de9467ca3a310c9b167e45a4033deb45a07a6057.
Actual PG16 compiled HTTPS proof remains FAIL pending new exact-head Linux CI; renewed source reviews and applicable exact-head CI still block acceptance. No Docker/psql local proof, skip/retry source edits or storage grants/security model changes.
Frozen Git-normalized SubTrack/apps/api/src/subscriptions/browser-subscription-lifecycle.composition.ts 7249a9b3705e04893ac9ad6502f17f9d9a05c42c
Frozen Git-normalized SubTrack/apps/api/src/subscriptions/browser-subscription-lifecycle.composition.spec.ts db71b707c9fac3e0ac3e0028f13d8b7880a45082
Historical artifacts/generated CRLF/private logs preserved; root alone task/status/backlog/commit/push/merge. Local heavy token released after all jobs exit0; context ends below20 calls, no repeated failure.
