# Pinned gateway validation

2026-10-14 conductor check. Official Caddy release v2.11.7 (published2026-10-03) queried through GitHub release API. Windows amd64 archive downloaded from that release into ignored local tooling; SHA256 matched asset digest 0a1edc0b799512051c57071ce0e798d3f2cf67dc98171366f1d2b326072e3b06. Binary reports v2.11.7. Actual `caddy adapt --config infra/sandbox/Caddyfile --adapter caddyfile --validate` exited0 against the reviewed configuration, SHA25633474d05490e9e53d3ec40e83102a2f426a85c648557e049e481cc735f5175b7.

Read-only registry inspection via direct VPS OS SSH identified official caddy:2.11.7 index digest sha256:685ae3d7c34d9b5f8caeddc5d14051db7bbd88ff1f5a2fa0c16bd8ca328fb7af and linux/amd64 manifest sha256:173b26306d711395accaeba8b67afcaad2a085ccb1e6bf26010bfe8c095a5229. No image was pulled, container started, port exposed or remote file written. No OpenClaw application/software used.

This validates configuration/module support and digest provenance only. It does not establish live ACME/IP certificate issuance, renewal, trusted phone TLS, volume ownership, sandbox backend operation or deployment acceptance. Validate intended Linux container and Compose composition before deployment. Primary references: https://caddyserver.com/docs/caddyfile/directives/tls and https://github.com/caddyserver/caddy/issues/7399 .
