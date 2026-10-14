# Actual pinned Caddy header boundary probe

2026-10-14 root executed existing verified Caddy2.11.7 on two owned localhost ports with synthetic public-test metadata only, no TLS/ACME/VPS/production traffic. Adversarial incoming gateway/source/extra/Forwarded/X-Forwarded headers tested against a real upstream HTTP server. Initial header_up wildcard deletion also removed trustedsetgateway/source: FAIL, correctly withheld.

Corrected request_header stripping X-Subtrack-Sandbox-* before reverse_proxy, followed by exact header_up canonicalHost/privateprocesskey/actualremote_host and header_up deletion of Forwarded/X-Forwarded-*, passed all five measured boolean assertions. PinnedCaddy actual default-forwarder deletion behavior verified, not assumed. Own childprocess/server/config cleanup REMOVED. Ignoredhelper gateway-boundary-probe.cjs records execution; synthetic value never output.

This qualifies exact header mutation order only. Public trustedTLS, liveCaddyconfigroute/body limits, same-image backend and nativedevice checks still required. Activationplan must use this actualordering; disabledexistingCaddyfile unchanged.
