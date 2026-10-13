#!/usr/bin/env bash
set -euo pipefail
# Official release/API digest and Apache-2.0 license verified 2026-10-13.
# https://github.com/mobile-dev-inc/maestro/releases/tag/cli-2.11.0
proof_tools="${RUNNER_TEMP:?}/subtrack-native-tools"
mkdir -p "$proof_tools"
curl --fail --silent --show-error --location \
  https://github.com/mobile-dev-inc/Maestro/releases/download/cli-2.11.0/maestro.zip \
  --output "$proof_tools/maestro.zip"
node --input-type=module - "$proof_tools/maestro.zip" <<'NODE'
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const actual = createHash('sha256').update(readFileSync(process.argv[2])).digest('hex');
if (actual !== '5384593cb4e7a106489e75a821d157dd43f4e438df6bc308b72e82c685e1283a') throw Error('Maestro checksum mismatch');
NODE
unzip -q "$proof_tools/maestro.zip" -d "$proof_tools"
chmod +x "$proof_tools/maestro/bin/maestro"
printf '%s\n' "$proof_tools/maestro/bin" >> "${GITHUB_PATH:?}"
