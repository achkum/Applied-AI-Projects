ST-226 startup diagnosis v1 — architect-platform read-only investigation; no approval or source correction.
Target PR256 head 7847c963ab71a117e7a4adaf7d0fc0b4891c36a9; root-supplied Linux run38096675090 receipt: child_startup_exit / parent_cleanup child_exit / fixture_cleanup false.
Concrete deterministic blocker: lifecycle composition snapshotOptions calls descriptor-only bind on injected Prisma $queryRaw and $transaction before datastore preflight.
Constructed installed real PrismaClient6.19.2 with harmless synthetic invalid URL, log:[]; never connected, queried, or opened a listener.
Both method property reads are functions; both own descriptors exist and contain a value, but their descriptor values are not functions; neither descriptor has a getter/setter.
Thus lifecycle bind rejects the actual Prisma proxy and main exits1 before ready; datastore preflight and Nest initialization are not reached through this path.
Existing compiled factory probe with valid structural options and real Prisma emitted only OPTIONS_DESCRIPTOR_DENIED / connectInvoked false / queryInvoked false.
Accepted READ composition validates typeof prisma.$queryRaw/$transaction property reads and does not descriptor-bind Prisma; auth capability descriptor binding is separate.
No runtime/status/commit/CI changes, database authority, raw logs, URLs, or error strings emitted; original 2026-10-10T23:17:14Z attempt1 L240 and counters preserved.
