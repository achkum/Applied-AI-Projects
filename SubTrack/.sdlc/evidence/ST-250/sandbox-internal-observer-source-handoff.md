# ST250 internal observer repair source handoff

2026-10-14. Source-only implementation of the root-approved four-path repair and independent sandbox-internal-observer-privacy-plan-review.md PLAN GO. No Docker, SQL, hosted dispatch, VPS action or Git mutation was executed by this author. Actual prior host/image runs reached LOAD/ADMIN_CONNECT/CONNECTION; this patch changes only the qualification observer transport. Real new-head qualification remains necessary.

The launcher removes PostgreSQL host publication, waits for the original owned-container pg_isready, captures the exact PostgreSQL CID, and inspects that CID plus the captured internal network before writing private pg.address. The strict shared internalObserverAddress validator requires exact captured CID/network IDs and custody marker; internal bridge driver; matching container and network labels; no published ports; exactly one container attachment to that network; canonical RFC1918 IPv4 with a usable last octet; and the same address in the network's captured container endpoint. Host mapping is installed only after this verification and maps database to that exact inspected address. Existing exact hosts restoration and all custody teardown remain intact.

Before configuration/DDL, the Node harness independently re-inspects the same captured PostgreSQL CID/network and pinned PostgreSQL image, revalidates the address and checks equality with the private address file. The administrative pool uses this inspected address; ordinary host observer continues using the unchanged runtime configuration's database hostname, now bound to the same address. No caller-provided IP/target/fallback is accepted.

Image API containers remove host publication. After each actual generation starts, the harness freshly inspects both that captured API CID and the network (including the new endpoint), validates the same strict route binding and uses its address for TCP readiness and all actual HTTP requests. The restart obtains a fresh binding instead of retaining the old address. Existing image/label/UID/read-only/resource/secret-mount checks remain intact. Host-v1 main retains loopback4000. No new bridge, host networking, public publication, egress or deployed ingress behavior is introduced.

The two DDL sources, startup configuration, receipt schemas, clocks, all twenty ordered assertions and same-image no-host-fallback semantics are unchanged. No new proof flag or product-completion claim is made.

Validation: thirteen focused Node tests pass, enforcing 100% lines/branches/functions for sandbox-qualification-receipt.cjs. Added hostile captured-ID/network/label/port/address/membership tests, distinct restart addresses, accessor rejection, and actual launcher/harness transport checks. Node syntax for harness/module and Bash syntax for launcher pass. No broad suite or API compile repeated.

Frozen source hashes (repository-relative paths):
- SubTrack/tools/database/sandbox-qualification.cjs: 07407aa39ead9519dc699bf1fdcbc15f870c0332c8b60235f8a794ad76d2715a
- SubTrack/tools/database/sandbox-qualify.sh: 724e254a7f626fcd040e66076545f076e4029e2e161aaf1398a2bd5f0e7bd5a5
- SubTrack/tools/database/sandbox-qualification-receipt.cjs: c1af23e21f382c404ce45587c68c57ba828f9d1fe3c0be23dae3ae0535f9bf45
- SubTrack/tools/database/sandbox-qualification-receipt.test.cjs: 17b5294659c384cd73a08d72b14a893691db81c7aae5db206387a2739afc0fd6

Independent source review and root curation must precede the causal new-head execution. Draft transfer implementation stayed on hold during this repair; docs/ops/SANDBOX.md is exclusively owned by the VPS delivery author.
