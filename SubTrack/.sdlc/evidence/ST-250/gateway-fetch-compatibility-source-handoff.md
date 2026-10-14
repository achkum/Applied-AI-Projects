# Gateway fetch transport compatibility source handoff

Measured cause: actual local pinned Caddy2.11.7 with Node24 fetch forwarded Accept-Language, Sec-Fetch-Mode and proxy-added Via. All three are outside the unchanged API HEADERS set, so sandboxHeaders rejected the request. Removing language/fetch transport metadata alone was insufficient; removing upstream Via also was necessary in this measurement.

Source repair: request_header -Accept-Language, request_header -Sec-Fetch-*, and reverse_proxy header_up -Via only. The API header allowlist/authentication/body/status logic is unchanged. Exact profile advances capless-caddy-v2 to v3 and binds new Caddyfile SHA, retaining the same image pin, executable SHA/51953826 bytes, no capabilities and fixed IPv4 SNI. Four historical backend execution inputs and all sourceBinding immutable comparisons remain unchanged. Docs explain retained metadata-only operator rollout and qualification still required.

Durable local regression: gateway-fetch-boundary-probe.cjs reads the actual request_header/header_up directives from source and actual sandboxHeaders/HEADERS directly from unchanged API source, using Node24 native TS stripping for this isolated function. Actual Caddy child runs only loopback synthetic HTTP, not TLS/API/DB or production. Baseline removes the three candidate directives to reproduce rejection; actual directives produce header-validator acceptance. Native-like Sec-Fetch-Dest/Site also disappear. Spoofed trusted/forwarded fields cannot survive, actual socket source/trusted gate are substituted, authorization/idempotency preserve, unrelated X-Unrelated still rejects. Entire resulting header-name set is compared against unchanged HEADERS; no other unsupported headers were observed. This proves header boundary compatibility only, not real bootstrap/session acceptance. All own child/listeners/generated configs/validator files removed on exit; output is fixed flags only. Probe launcher remains durable evidence.

Validation: actual pinned local probe PASS; focused capless gateway custody test PASS with exact new profile/hash and old-v2 rejection; Node module/probe syntax PASS. No remote requests, CI, Docker, release, source rollover, backend rebuild, Git or deployment actions ran. Independent source review then root-owned retained metadata-only rollout/readback are pending.

Caddy docs, verified2026-10-15: https://caddyserver.com/docs/caddyfile/directives/request_header (deletion/wildcard semantics), https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#headers (upstream deletion). Actual2.11.7 probe establishes generated Via behavior; no inferred behavior change relied on docs alone.

SHA256:
- infra/sandbox/Caddyfile: 3e114a55a753e8c33e158c07ab2b1584826a6bafa08edba142baeea1533411db
- tools/sandbox/image-import-binding.cjs: 9e12dc81aae5380d03377ae6095502e82a4f50897ed15ed4950a96e996a07f43
- tools/sandbox/activation-contract.test.cjs: 48cc0fce4c2872dd05f8085c6f6a37e2cc5ab8e6a7b0e6852a8de635fcafa8d5
- docs/ops/SANDBOX.md: 0c68fa4ae6da4bd98b72e6872876368666fe9bccc25863670631fff498886c23
- .sdlc/evidence/ST-250/gateway-fetch-boundary-probe.cjs: 979c26a67bcb3d77567604b4d149dd2adcde09452fc9a4b403c662313ad17a57
- unchanged apps/api/src/sandbox/sandbox-http.ts: 0fd9cc584101cc82570dbdadef7ae36eb3831df428567191be26c89789b9064f