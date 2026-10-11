#!/usr/bin/env bash
set -euo pipefail
umask 077

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
cd "$root"
base="$(cd "${RUNNER_TEMP:-${TMPDIR:-/tmp}}" && pwd -P)"
work="$(mktemp -d "$base/st237-tls.XXXXXXXX")"
[[ "$work" == "$base"/st237-tls.* && -d "$work" && ! -L "$work" ]] || exit 1
exec 3>&1 4>&2
exec >"$work/internal.log" 2>&1
server_pid=''
browser_pid=''
phase=SOURCE
proof_complete=0
cleanup_group() {
  local pid="$1" i
  [[ -n "$pid" ]] || return 0
  kill -TERM -- "-$pid" 2>/dev/null || true
  for ((i=0; i<50; i++)); do
    kill -0 -- "-$pid" 2>/dev/null || break
    sleep 0.1
  done
  if kill -0 -- "-$pid" 2>/dev/null; then
    kill -KILL -- "-$pid" 2>/dev/null || true
    for ((i=0; i<50; i++)); do
      kill -0 -- "-$pid" 2>/dev/null || break
      sleep 0.1
    done
  fi
  wait "$pid" 2>/dev/null || true
  ! kill -0 -- "-$pid" 2>/dev/null
}
cleanup() {
  local code=$? cleanup_ok=1
  trap - EXIT INT TERM
  cleanup_group "$browser_pid" || cleanup_ok=0
  cleanup_group "$server_pid" || cleanup_ok=0
  if [[ "$work" == "$base"/st237-tls.* && -d "$work" && ! -L "$work" ]]; then
    rm -rf -- "$work" || cleanup_ok=0
  else
    cleanup_ok=0
  fi
  [[ ! -e "$work" && ! -L "$work" ]] || cleanup_ok=0
  if ((code == 0 && proof_complete == 1 && cleanup_ok == 1)); then
    printf 'PASS ST237_EPHEMERAL_TLS_PROFILE_CUSTODY\n' >&3
    printf 'PROOF PASS head=%s cleanup=removed\n' "$ST237_EXPECTED_HEAD" >&3
    exit 0
  fi
  printf 'FAIL ST237_%s cleanup=%s\n' "$phase" "$([[ "$cleanup_ok" == 1 ]] && printf removed || printf failed)" >&4
  exit 1
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

[[ "${ST237_EXPECTED_HEAD:-}" =~ ^[0-9a-f]{40}$ ]]
head="$(git rev-parse HEAD)"
[[ "$head" == "$ST237_EXPECTED_HEAD" ]]
printf 'INPUT head=%s\n' "$head" >&3
for rel in SubTrack/apps/web/test/private-https-preflight.mjs SubTrack/tools/browser/private-https-preflight.sh SubTrack/apps/web/package.json SubTrack/pnpm-lock.yaml .github/workflows/subtrack-private-https-profile-proof.yml; do
  [[ -f "../$rel" && ! -L "../$rel" ]]
  blob="$(git rev-parse "$head:$rel")"
  [[ "$blob" =~ ^[0-9a-f]{40}$ ]]
  [[ "$(git hash-object "../$rel")" == "$blob" ]]
  digest="$(sha256sum "../$rel")"
  digest="${digest%% *}"
  [[ "$digest" =~ ^[0-9a-f]{64}$ ]]
  printf 'INPUT file=%s blob=%s sha256=%s\n' "$rel" "$blob" "$digest" >&3
done

phase=RUNTIME
[[ "$(corepack pnpm --filter @subtrack/web exec node -p "require('playwright/package.json').version")" == 1.63.0 ]]
nss_version="$(dpkg-query -W -f='${Version}' libnss3-tools)"
[[ "$nss_version" =~ ^[0-9A-Za-z.+:~-]+$ ]]
command -v certutil >/dev/null
firefox_bin="$(corepack pnpm --filter @subtrack/web exec node -p "require('playwright').firefox.executablePath()")"
[[ -f "$firefox_bin" && -x "$firefox_bin" ]]
firefox_line="$("$firefox_bin" --version)"
[[ "$firefox_line" =~ ([0-9]+(\.[0-9]+){1,3}) ]]
firefox_version="${BASH_REMATCH[1]}"
printf 'INPUT runtime=ubuntu-24.04 playwright=1.63.0 nss=%s firefox=%s\n' "$nss_version" "$firefox_version" >&3

phase=CERTIFICATE

mkdir -m 700 "$work/trusted" "$work/clean"
openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 1 \
  -subj '/CN=ST237 task CA' -keyout "$work/ca.key" -out "$work/ca.crt" \
  >/dev/null 2>&1
openssl req -new -newkey rsa:3072 -sha256 -nodes \
  -subj '/CN=localhost' -keyout "$work/leaf.key" -out "$work/leaf.csr" \
  >/dev/null 2>&1
cat > "$work/leaf.ext" <<'EOF'
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:localhost
EOF
openssl x509 -req -in "$work/leaf.csr" -CA "$work/ca.crt" -CAkey "$work/ca.key" \
  -CAcreateserial -out "$work/leaf.crt" -days 1 -sha256 -extfile "$work/leaf.ext" \
  >/dev/null 2>&1
cat "$work/leaf.crt" "$work/ca.crt" > "$work/leaf-chain.crt"
openssl verify -CAfile "$work/ca.crt" -verify_hostname localhost "$work/leaf.crt" >/dev/null
if openssl verify -CAfile "$work/ca.crt" -verify_ip 127.0.0.1 "$work/leaf.crt" >/dev/null 2>&1; then
  echo 'FAIL ST237_LEAF_HAS_IP_SAN' >&2
  exit 1
fi
certutil -N --empty-password -d "sql:$work/trusted" >/dev/null
certutil -A -d "sql:$work/trusted" -n ST237-task-CA -t 'C,,' -i "$work/ca.crt" >/dev/null
certutil -L -d "sql:$work/trusted" -n ST237-task-CA >/dev/null
[[ ! -e "$work/clean/cert9.db" ]]

export ST237_LEAF_KEY="$work/leaf.key"
export ST237_LEAF_CHAIN="$work/leaf-chain.crt"
export ST237_TRUSTED_PROFILE="$work/trusted"
export ST237_CLEAN_PROFILE="$work/clean"
export NODE_ENV=production
setsid node apps/web/test/private-https-preflight.mjs server >"$work/server.log" 2>&1 &
phase=SERVER
server_pid=$!
for _ in {1..100}; do
  if grep -q '^ST237_TLS_SERVER_READY$' "$work/server.log"; then break; fi
  if ! kill -0 "$server_pid" 2>/dev/null; then echo 'FAIL ST237_SERVER_START' >&2; exit 1; fi
  sleep 0.2
done
if ! grep -q '^ST237_TLS_SERVER_READY$' "$work/server.log"; then
  echo 'FAIL ST237_SERVER_TIMEOUT' >&2
  exit 1
fi
setsid node apps/web/test/private-https-preflight.mjs browser >"$work/browser.log" 2>&1 &
phase=BROWSER
browser_pid=$!
for ((i=0; i<1800; i++)); do
  kill -0 "$browser_pid" 2>/dev/null || break
  sleep 0.1
done
if kill -0 "$browser_pid" 2>/dev/null; then exit 1; fi
if ! wait "$browser_pid"; then
  diagnostic="$(grep -E '^DIAG ST237_BROWSER phase=(LAUNCH|TRUSTED_PAGE|TRUSTED_NAVIGATE|TRUSTED_RESPONSE|TRUSTED_POST|WRONG_HOST|UNTRUSTED_LAUNCH|UNTRUSTED_NAVIGATE) class=(SSL_ERROR_BAD_CERT_DOMAIN|SEC_ERROR_UNKNOWN_ISSUER|MOZILLA_PKIX_ERROR_SELF_SIGNED_CERT|SEC_ERROR_EXPIRED_CERTIFICATE|NS_ERROR_FAILURE|NS_ERROR_NET_RESET|NS_ERROR_NET_INTERRUPT|NS_ERROR_UNKNOWN_HOST|SEC_ERROR_CA_CERT_INVALID|SSL_ERROR_RX_RECORD_TOO_LONG|CONNECTION_REFUSED|TIMEOUT|BROWSER_CONTEXT_CLOSED|LAUNCH_FAILED|NEXT_PAGE_ASSERT|NEST_POST_ASSERT|NEST_AUTHORITY_ASSERT|TLS_NEGATIVE_ASSERT|NO_RESPONSE|HTTP_[1-5][0-9][0-9]|OTHER)$' "$work/browser.log" | tail -n 1 || true)"
  if [[ -n "$diagnostic" ]]; then printf '%s\n' "$diagnostic" >&3; fi
  exit 1
fi
for marker in ST237_TRUSTED_LOCALHOST_NEXT_NEST_TLS ST237_WRONG_HOSTNAME_REJECTED ST237_UNTRUSTED_CA_REJECTED; do
  grep -qx "PASS $marker" "$work/browser.log"
  printf 'PASS %s\n' "$marker" >&3
done
phase=CUSTODY
proof_complete=1
