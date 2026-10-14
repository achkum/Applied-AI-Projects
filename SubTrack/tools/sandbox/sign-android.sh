#!/usr/bin/env bash
# Source preparation: never generate/read a real key or invoke a signing container yet.
set -euo pipefail
[[ $# == 1 ]] || exit 2
case "$1" in
  initialize|sign) printf 'Sandbox signing unavailable: custody/transfer/backup gates pending\n' >&2; exit 2;;
  validate) ;;
  *) exit 2;;
esac
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
[[ "${SANDBOX_ANDROID_SIGNING_IMAGE:-}" =~ ^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$ ]]
[[ -f "$root/infra/sandbox/Dockerfile.android-signing" ]]
node --check "$root/tools/sandbox/android-release-receipt.mjs"
printf 'ST250_ANDROID_SIGNER_SOURCE_VALID signing=disabled keys=not-accessed\n'
