# VPS Setup (RackNerd): hosting SubTrack next to OpenClaw

## 0. Can we use the public IP without a domain? Yes, with caveats.
- **HTTPS on a bare IP is possible.** Let's Encrypt issues IP-address certificates. They are short-lived (about 6 days) and must auto-renew; Caddy handles this with the ACME `shortlived` profile.
  - Verify that your Caddy version supports IP identifiers for the ACME issuer. If it doesn't, use a self-signed certificate on staging.
- **What an IP can't do well:**
  - iOS universal links and Android App Links (these need a domain with `.well-known` files).
  - Some OAuth providers reject IP redirect URIs; Tink may be one (see R1).
  - Email sender reputation.
- **Plan:** run on the IP now. When you buy a domain, change one line in the Caddyfile and update the redirect URIs.

## 1. Measure first (ST-001)
Run `nproc; free -h; df -h; docker info | grep -i -E 'cpus|memory'` and record the output in `.sdlc/reports/preflight.md`. Resource budgets in ARCHITECTURE §7 are adjusted from this.

## 2. Layout
```
/opt/subtrack/
├─ secrets/           root:root 700 — staging.env, demo.env, bankid-test.p12, asc-key.p8, play-sa.json
├─ compose/           checked-out copy of infra/compose (deployed by devops agent via git pull of a tag)
├─ data/postgres/     volume
├─ backups/           nightly pg_dump (7 daily + 4 weekly), restore test weekly
└─ caddy/             Caddyfile, data, config
```

## 3. Network & hardening
- UFW: allow 22 (preferably a non-default port, key-only), 80 and 443. Deny everything else. Internal services bind to the Docker network only.
- SSH: key-only, `PermitRootLogin no`, fail2ban.
- The OpenClaw gateway/Control UI is **never** exposed publicly. Use an SSH tunnel or Tailscale (see OpenClaw's remote-access docs).
- Unattended security upgrades are enabled.
- Staging uses Caddy `basic_auth` until D-05 approval.

## 4. Caddyfile sketch (the devops agent finalises it)
```
{
  email you@example.com
  cert_issuer acme {
    profile shortlived
  }
}
https://<PUBLIC_IP> {
  encode zstd gzip
  header { Strict-Transport-Security "max-age=300"; X-Content-Type-Options nosniff; Referrer-Policy strict-origin-when-cross-origin }
  basic_auth /* { founder <bcrypt-hash> }
  handle_path /api/* { reverse_proxy api:4000 }
  handle { reverse_proxy web:3000 }
}
```
Keep the HSTS max-age short while on an IP. Increase it once a domain is in place.

## 5. Agents vs production
- OpenClaw agents run builds and tests in their workspaces or sandboxes under the `openclaw` user. They **cannot read** `/opt/subtrack/secrets` (permissions).
- Deployments run as `deploy.sh <git-tag>` via a narrow sudoers rule for the `openclaw` user: `openclaw ALL=(root) NOPASSWD: /opt/subtrack/deploy.sh`.
  - The script pulls the tag, runs migrations, runs `docker compose up -d`, and checks health.
  - It deploys **staging** and **demo** only.
