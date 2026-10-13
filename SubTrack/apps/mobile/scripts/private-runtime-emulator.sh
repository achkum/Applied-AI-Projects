#!/usr/bin/env bash
set -euo pipefail
# Official stable Google repository metadata verified 2026-10-13:
# https://dl.google.com/android/repository/repository2-3.xml
# Emulator 37.2.12, Android SDK license, official SHA1 + size. Independent SHA256
# derived from that exact HTTPS archive after validating the official metadata.
proof_tools="${RUNNER_TEMP:?}/subtrack-native-tools"
mkdir -p "$proof_tools"
proof_private="$RUNNER_TEMP/subtrack-native-proof/private"
mkdir -p "$proof_private"
chmod 700 "$proof_private"
printf 'ST244_ANDROID phase=emulator-provision event=started\n'
curl --fail --silent --show-error --location --connect-timeout 15 --max-time 180 \
  https://dl.google.com/android/repository/emulator-linux_x64-16428233.zip \
  --output "$proof_tools/emulator.zip"
node --input-type=module - "$proof_tools/emulator.zip" <<'NODE'
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
const archive = process.argv[2];
if (statSync(archive).size !== 349654171) throw Error('Official emulator archive size mismatch');
const bytes = readFileSync(archive);
if (createHash('sha1').update(bytes).digest('hex') !== 'cd7362ea55dfb86a418958138dc396e74165dd01') throw Error('Official emulator checksum mismatch');
if (createHash('sha256').update(bytes).digest('hex') !== 'b08fc43d8608d2955f607f1b287beb525041e730086bdca3af152accac3af9c1') throw Error('Pinned emulator SHA256 mismatch');
NODE
unzip -q "$proof_tools/emulator.zip" -d "$proof_tools"
test -x "$proof_tools/emulator/emulator"
if timeout --signal=TERM --kill-after=5s 10s ldd "$proof_tools/emulator/emulator" > "$proof_private/emulator-loader.log" 2>&1; then
  printf 'ST244_ANDROID phase=emulator-provision event=loader-probe-completed\n'
else
  loader_code=$?
  printf 'ST244_ANDROID phase=emulator-provision event=loader-probe-exit-%s\n' "$loader_code"
fi
if timeout --signal=TERM --kill-after=5s 20s "$proof_tools/emulator/emulator" -version > "$proof_private/emulator-version.log" 2>&1; then
  if ! grep -Eq 'Android emulator version 37\.2\.12(\.0)?([[:space:]]|$)' "$proof_private/emulator-version.log"; then
    printf 'ST244_ANDROID phase=emulator-provision event=unexpected-tool-version\n'
    exit 1
  fi
else
  version_code=$?
  node "$(dirname "$0")/private-runtime-loader-diagnostics.mjs" "$proof_private/emulator-loader.log" "$proof_private/emulator-version.log"
  printf 'ST244_ANDROID phase=emulator-provision event=version-check-exit-%s\n' "$version_code"
  exit 1
fi
printf 'SUBTRACK_PRIVATE_EMULATOR_BIN=%s\n' "$proof_tools/emulator/emulator" >> "${GITHUB_ENV:?}"
printf 'ST244_ANDROID phase=emulator-provision event=verified-version-37.2.12\n'
